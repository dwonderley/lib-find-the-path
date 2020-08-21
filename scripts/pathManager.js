import { Point, getPointFromToken, getPointSetFromToken, getPointSetFromCoord, getTokenHeight, getTokenWidth } from "./point.js"

// Because apparently JS doesn't have this built in...
/*
 * @private
*/
class PriorityQueue
{
	constructor ()
	{
		this.data = new Array ();
	}

	pop ()
	{
		return this.data.shift ();
	}

	push (item_, priorityMeasure_)
	{
		if (priorityMeasure_)
		{
			priorityMeasure_ (this.data, item_)
			return;
		}

		for (let i = 0; i < this.data.length; ++i)
		{
			const curElement = this.data[i];

			if (curElement.cost > item_.cost)
			{	
				this.data.splice (i, 0, item_);
				return;
			}
			if (curElement.cost === item_.cost)
			{
				// Prefer nodes closer to the goal
				if (curElement.distToDest > item_.distToDest)
				{
					this.data.splice (i, 0, item_);
					return;
				}
				if (curElement.distToDest < item_.distToDest)
					continue;

				const p1 = curElement.prev.origin;
				const p2 = curElement.origin;

				const p3 = item_.prev.origin;
				const p4 = item_.origin;

				const delta1 = Math.abs (p2.x - p1.x) + Math.abs (p2.y - p1.y);
				const delta2 = Math.abs (p4.x - p3.x) + Math.abs (p4.y - p3.y);

				// If the remaining distance is the same, prefer the one with less displacement. This only comes up in grids 8-tile movement with uniform movement costs
				if (delta1 > delta2)
				{
					this.data.splice (i, 0, item_);
					return;
				}
				if (delta1 < delta2)
					continue;

				function calcCross (start_, current_, dest_)
				{
					const dx1 = start_.x - dest_.x;
					const dy1 = start_.y - dest_.y;
					const dx2 = current_.x - dest_.x;
					const dy2 = current_.y - dest_.y;

					return Math.abs (dx1 * dy2 - dx2 * dy1);
				}

				const cross1 = calcCross (p1, p2, curElement.dest);
				const cross2 = calcCross (p3, p4, item_.dest);

				// If the displacement is the same, prefer the one with a smaller cross-product
				if (cross1 >= cross2)
				{
					this.data.splice (i, 0, item_);
					return;
				}
			}
		}

		this.data.push (item_);
	}

	get length () { return this.data.length; }
};

/*
 * @private
*/
class Node
{
	constructor (originSet_, destSet_, distTraveled_)
	{
		this.originSet = originSet_;
		this.destSet = destSet_;
		this.distTraveled = distTraveled_;
		this.distToDest = Math.min (...this.originSet.map (p1 => {
			return Math.min (...this.destSet.map (p2 => p1.distToPoint (p2)));
		}));
		this.cost = this.distTraveled + this.distToDest;

		this.prev = null;
	}

	// Tokens of all sizes are represented by their upper-left point (index 0), a width, and a height
	get dest ()
	{
		return this.destSet[0];
	}

	// Tokens of all sizes are represented by their upper-left point (index 0), a width, and a height
	get origin ()
	{
		return this.originSet[0];
	}

	// Since all points in a set move as one, we can represent the entire collection with a single id
	get id ()
	{
		let text = "";
		text += this.origin.x + "," + this.origin.y;

		if (! this.prev)
			return text;
		
		return text + "," + this.prev.origin.x + "," + this.prev.origin.y;
	}
};

export class Path
{
	/*
	 * @private
	*/
	constructor (data_)
	{
		this.originSet = data_.originSet;
		this.destSet = data_.destSet;
		this.token = data_.token;
		this.maxPathLength = data_.movement;

		this.width = data_.width ? data_.width : getTokenWidth (this.token);
		this.height = data_.height ? data_.height : getTokenHeight (this.token);

		this._path = new Array ();

		// Todo: make this a function accepting the token and movement left in path? Usually, tokens can move through allied spaces but cannot stop in them. As is, tokens cannot move through allied spaces at all.
		this._collisionMatters = true;
		this._priorityMeasure = data_.priorityMeasure;

		this.valid = false;
	}

	// A*
	async findPath ()
	{
		let frontier = new PriorityQueue ();
		let visited = new Map ();
		let n = new Node (this.originSet, this.destSet, 0);

		frontier.push (n);

		while (frontier.length > 0)
		{
			n = frontier.pop ();

			if (n.prev && ! los (n.prev.origin, n.origin, this.width, this.height))
				continue;

			if (n.distToDest === 0)
			{
				this.valid = true;
				break;
			}

			// Tokens with size > 1 have overlap when they move. We don't want them to colide with themselves
			if (n.prev && n.originSet.filter (p => {
				return ! n.prev.originSet.some (pp => pp.equals (p));
			}).some (p => collision (this.token, p, this._collisionMatters)))
			{
				continue;
			}

			if (n.distTraveled > this.maxPathLength)
			{
				console.log ("lib - Path Planner | Failed to find path to goal state");
				// This is the first node that is out of range, so the previous node was valid
				// todo: This won't hold because of tokens moving through other tokens' spaces
				n = n.prev;
				break;
			}
 
			// Since the goal point is checked for all points in the origin set against all points in the dest set, we only need to expand the origin node.
			n.origin.neighbors ().map (p => {
				let node = new Node (getPointSetFromCoord (p.x, p.y, this.width, this.height),
						     n.destSet,
						     n.distTraveled + 1);
				node.prev = n;
				return node;
			}).filter (node => {
				const id = node.id;

				if (visited.has (id))
					return false;

				visited.set (id, 1);
				return true;
			}).forEach (node => {
				frontier.push (node, this._priorityMeasure);
			});
		}

		this.unwind (n);
	}

	unwind (node_)
	{
		this._path = new Array ();

		for (let n = node_; n !== null; n = n.prev)
			this._path.unshift (n);
	}

	// Returns a subpath from the origin to the point on the path with distance dist_ away from the target
	within (dist_)
	{
		return this._path.filter (e => { return e.distToDest >= dist_ }).map (n => { return n.origin; });
	}

	get cost () { return this?.terminus.cost; }

	get terminalDistanceToDest () { return this.terminus?.distToDest; }

	get terminus ()
	{
		if (this._path.length === 0) return undefined;
		return this._path[this._path.length - 1];
	}

	get length () { return this._path.length; }
	get path () { return this._path; }
};

/*
The path manager should be unique per token. It stores the optimal path between the owning token and any number of target tokens. Targets are added through the addToken method below.
It is intended, but not necessary, to clear the path manager before new calculations.
Path calculations are fast, generally less than 3 ms from my testing.
*/
export class PathManager
{
	constructor (token_)
	{
		this._token = token_;

		// _paths: id -> Path
		this._paths = new Map ();
		this._point = undefined;
	}

	static async pathFromData (data_)
	{
		const p = new Path (data_);
		await p.findPath ();
		return p;
	}

	// A less general case of pathFromData. Finds a path between a source and destination Point. The origin_ has width_ and height_ in tiles. A valid path may be at most movement_ tiles long.
	static async pathToPoint (origin_, dest_, width_, height_, movement_)
	{
		const p = new Path ({
			"originSet": getPointSetFromCoord (origin_.x, origin_.y, width_, height_),
			"destSet": getPointSetFromCoord (dest_.x, dest_.y, 1, 1),
			"width": width_ ? width_ : 1,
			"height": height_ ? height_ : 1,
			"movement": movement_ ? movement_ : Infinity,
			"token": null,
		});
		await p.findPath ();
		return p;
	}

	// Finds a path between two tokens that takes no more than movement_ tiles and stores it. If a path does not exist, it stores the best path it found, but that path is not marked "valid." Path validity should be checked as needed.
	async addToken (target_, movement_)
	{
		// It is not recommended to allow this
		if (this._paths.has (target_.id))
		{
			console.log ("lib - Path Planner | Attempted to add existing token to path manager");
			this_.paths.delete (target_.id);
		}

		// todo: support priority queue and collision settings
		const p = new Path ({
			"originSet": getPointSetFromToken (this._token),
			"destSet": getPointSetFromToken (target_),
			"token": this._token,
			"movement": movement_,
		});

		await p.findPath ();

		this._paths.set (target_.id, p);
	}

	addPath (id_, path_)
	{
		this._paths.set (id_, path_);
	}

	clear ()
	{
		this._paths.clear ();
	}

	path (id_) { return this._paths.get (id_);}

	get paths () { return this._paths; }
};

/*
* @param {Token} start_
* @param {Point} point_
*/
export function isTraversable (token_, oldPoint_, newPoint_, collisionMatters_)
{
	const w = getTokenWidth (token_);
	const h = getTokenHeight (token_);

	return los (oldPoint_, newPoint_, w, h)
	       && ! collision (token_, newPoint_, collisionMatters_);
}

function los (oldPoint_, newPoint_, width_, height_)
{
	if (! oldPoint_ || oldPoint_ === newPoint_)
		return true;

	if (! newPoint_)
		return false;

	const ps1 = getPointSetFromCoord (oldPoint_.x, oldPoint_.y, width_, height_);
	const ps2 = getPointSetFromCoord (newPoint_.x, newPoint_.y, width_, height_);
	
	// A token may take up multiple tiles, and it moves by translation from an old set to a new set. A movement is valid if, for each translation, the old tile has line of sight on the new tile and each tile in the new set has los on every other tile in the set.
	for (let i = 0; i < width_ * height_; ++i)
	{
		if (canvas.walls.checkCollision (new Ray({ x: ps1[i].cpx (1), y: ps1[i].cpy (1)},
							 { x: ps2[i].cpx (1), y: ps2[i].cpy (1)})))
			return false;

		const p = { x: ps2[i].cpx (1), y: ps2[i].cpy (1) };

		// If A has los on B then B has los on A, so we only need to check half of these
		// todo: There must be a better way...
		for (let j = i; j < width_ * height_; ++j)
		{
			if (i === j)
				continue;

			if (canvas.walls.checkCollision (new Ray(p, { x: ps2[j].cpx (1), y: ps2[j].cpy (1)})))
				return false;
		}
	}

	return true;
}

// todo: replace collisionMatters bool with function?
function collision (token_, newPoint_, collisionMatters_)
{
	if (! collisionMatters_)
		return false;

	for (let token of canvas.tokens.placeables)
	{
		if (token_ && token.id === token_.id)
			continue;

		if (getPointSetFromToken (token).some (p => newPoint_.equals (p)))
			return true;
	}

	return false;
}
