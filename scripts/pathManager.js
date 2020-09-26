import { Point, PointFactory, MinkowskiParameter, Segment } from "./point.js"
import { FTPUtility } from "./utility.js"

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

	log (depth_ = 5)
	{
		for (let i = 0; i < Math.min (depth_, this.length); ++i)
			console.log (this.data[i]);
	}

	get length () { return this.data.length; }
};

/*
 * @private
*/
class Node
{
	constructor (origin_, dest_, distTraveled_, prev_ = null)
	{
		this._origin = origin_;
		this._dest = dest_;
		this.distTraveled = distTraveled_;
		this.distToDest = origin_.distToSegment (dest_);
		this.cost = this.distTraveled + this.distToDest;
		this.prev = prev_;
	}

	// Tokens of all sizes are represented by their upper-left point (index 0), a width, and a height
	get dest () { return this._dest.point; }
	get destSeg () { return this._dest; }
	// Tokens of all sizes are represented by their upper-left point (index 0), a width, and a height
	get origin () { return this._origin.point; }
	get originSeg () { return this._origin; }

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
	 * @throws
	*/
	// Accepts a combination of:
	// data_.origin:
	// 1) Segment
	// 2) Point with data_.width and data_.height >0
	// 3) Point with data_.token
	// data_.dest:
	// 1) Segment
	// 2) Point, assumes w/h = 1
	constructor (data_)
	{
		const isValidNumber = (thing_) => { return thing_ !== undefined && typeof(thing_) === "number"; }
		const isValidPosNumber = (thing_) => { return isValidNumber (thing_) && thing_ >= 0; }

		if (! data_.origin || ! data_.dest)
			throw "FindThePath | Invalid Path initialization: missing start/goal input";

		if (data_.origin instanceof Point)
		{
			if (! data_.token && ! (isValidPosNumber (data_.width) && isValidPosNumber (data_.height)))
				throw "FindThePath | Invalid Path initialization: must provide width/height or token";
		}
		else if (! data_.origin instanceof Segment
			 || (! data_.dest instanceof Segment && ! data_.dest instanceof Point))
		{
			throw "FindThePath | Invalid Path initialization: bad start/goal Segment";
		}

		if (! isValidPosNumber (data_.movement))
			throw "FindThePath | Invalid Path initialization: bad search range";

		if (data_.origin instanceof Segment)
		{
			this.origin = data_.origin;
		}
		else
		{
			if (data_.token)
				this.origin = PointFactory.segmentFromToken (data_.token);
			else
				this.origin = PointFactory.segmentFromPoint (data_.origin, data_.width, data_.height);
		}

		if (data_.dest instanceof Segment)
			this.dest = data_.dest;
		else
			this.dest = PointFactory.segmentFromPoint (data_.dest, 1, 1);

		this.token = data_.token;
		this.maxPathLength = data_.movement;

		this._path = new Array ();

		// Todo: make this a function accepting the token and movement left in path? Usually, tokens can move through allied spaces but cannot stop in them. As is, tokens cannot move through allied spaces at all.
		this._collisionConfig = { checkCollision: true, token: this.token };
		this._priorityMeasure = data_.priorityMeasure;

		this._utility = new FTPUtility ({ collisionConfig: this._collisionConfig });

		this.valid = false;
	}

	// A*
	async findPath ()
	{
		let frontier = new PriorityQueue ();
		let visited = new Map ();
		let n = new Node (this.origin, this.dest, 0);

		const width = n.originSeg.width;
		const height = n.originSeg.height;

		frontier.push (n);

		while (frontier.length > 0)
		{
			n = frontier.pop ();

			if (n.prev && ! this._utility.los (n.prev.originSeg, n.originSeg))
				continue;

			if (n.distToDest === 0)
			{
				this.valid = true;
				break;
			}

			// Tokens with size > 1 have overlap when they move. We don't want them to colide with themselves
			if (n.prev && n.originSeg.pointSet.some (p => {
				return ! n.prev.originSeg.contains (p) && this._utility.collision (n.originSeg);
			}))
			{
				continue;
			}

			if (n.distTraveled > this.maxPathLength)
			{
				console.log ("FindThePath | Failed to find path to goal state");
				// This is the first node that is out of range, so the previous node was valid
				// todo: This won't hold because of tokens moving through other tokens' spaces
				n = n.prev;
				break;
			}
 
			// Since the goal point is checked for all points in the origin set against all points in the dest set, we only need to expand the origin node.
			n.origin.neighbors ().map (p => {
				return new Node (PointFactory.segmentFromPoint (p, width, height),
						 n.destSeg,
						 n.distTraveled + 1,
						 n);
			}).filter (node => {
				if (! node.originSeg.isValid)
					return false;

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
		return this._path.filter (e => { return e.distToDest >= dist_ }).map (n => { return n.originSeg; });
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

export class PathManager
{
	constructor (metric_)
	{
		this._pointFactory = new PointFactory (metric_);

		// _paths: tokenId -> (targetId -> Path)
		this._paths = new Map ();
	}

	static async pathFromData (data_)
	{
		const p = new Path (data_);
		await p.findPath ();
		return p;
	}

	// Returns an unsorted Array of all Points within dist_ tiles of point_
	// If using a Segment that represents a token, you must set collisionConfig_.token, or it will collide with itself, potentially returnning an empty set.
	// To avoid this, use pointsWithinRangeOfToken (token_, dist_)
	static async pointsWithinRange (seg_, dist_, collisionConfig_ = { checkCollision: true, token: null })
	{
		if (! seg_ instanceof Segment)
		{
			console.log ("FindThePath | Invalid starting segment for call to pointsWithinRange");
			return ret;
		}

		if (! dist_ || typeof (dist_) !== "number" || dist_ < 0)
		{
			console.log ("FindThePath | Invalid range for call to pointsWithinRange");
			return ret;
		}

		let frontier = new PriorityQueue ();
		let visited = new Map ();
		let n = { origin: seg_, prev: null, cost: 0 };

		const width = n.origin.width;
		const height = n.origin.height;

		const getNodeId = (node_) => { return node_.origin.id; }

		const priorityMeasure = (array_, item_) =>
		{
			for (let i = 0; i < array_.length; ++i)
			{
				if (array_[i].cost > item_.cost)
				{
					array_.splice (i, 0, item_);
					return;
				}
			}
			
			array_.splice (array_.length, 0, item_);
		}

		frontier.push (n, priorityMeasure);

		const utility = new FTPUtility ();

		while (frontier.length > 0)
		{
			n = frontier.pop ();

			if (n.prev && ! utility.los (n.prev.origin, n.origin))
				continue;

			// Tokens with size > 1 have overlap when they move. We don't want them to colide with themselves
			if (n.prev && n.origin.pointSet.some (p => {
				return ! n.prev.origin.contains (p)
				       && utility.collision (n.origin, collisionConfig_);
			}))
			{
				continue;
			}

			if (n.cost > dist_)
				break;
 
			const id = getNodeId (n);

			// todo: this is disgusting. optimize...
			if (visited.has (id))
				continue;
			else
				visited.set (id, n);

			// Since the goal point is checked for all points in the origin set against all points in the dest set, we only need to expand the origin node.
			n.origin.point.neighbors ().map (p => {
				//todo: variable cost tiles 
				return { 
					origin: PointFactory.segmentFromPoint (p, width, height),
					prev: n,
					cost: n.cost + 1
				};
			}).filter (node => node.origin.isValid).forEach (node => {
				frontier.push (node, priorityMeasure);
			});
		}

		let ret = new Array ();
		visited.forEach ((v, k, m) => { ret.push ({ segment: v.origin, dist: v.cost })});
		return ret;
	}

	// A less general case of pathFromData. Finds a path between a source and destination Segment. A valid path may be at most movement_ tiles long.
	static async pathToSegment (origin_, dest_, movement_)
	{
		const p = new Path ({
			"origin": origin_,
			"dest": dest_,
			"movement": movement_ ? movement_ : Infinity,
			"token": null,
		});
		await p.findPath ();
		return p;
	}

	// Finds a path between two tokens that takes no more than movement_ tiles and stores it. If a path does not exist, it stores the best path it found, but that path is not marked "valid." Path validity should be checked as needed.
	async addToken (token_, target_, movement_)
	{
		if (! this._paths.has (token_.id))
			this._paths.set (token_.id, new Map ());

		let tokenPaths = this._paths.get (token_.id);

		// It is not recommended to allow this
		if (tokenPaths.has (target_.id))
		{
			console.log ("FindThePath | Attempted to add existing target (%s) "
				     + "to path manager for token (%s)",
				     target_.id, token_.id);
			tokenPaths.delete (target_.id);
		}

		// todo: support priority queue and collision settings
		const p = new Path ({
			"origin": this._pointFactory.segmentFromToken (token_),
			"dest": this._pointFactory.segmentFromToken (target_),
			"token": token_,
			"movement": movement_,
		});

		console.log ("FindThePath | Searching for path between tokens %s and %s", token_.id, target_.id);
		await p.findPath ();

		tokenPaths.set (target_.id, p);
	}

	// Add an existing path from a token to a target
	addPath (tokenId_, targetId_, path_)
	{
		this._paths.get(tokenId_).set (targetId_, path_);
	}

	// Clear all paths originating from a token
	clear (tokenId_) { this._paths.get (tokenId_).clear (); }
	// Clear all paths for all tokens
	clearAll () { this._paths.clear (); }

	// Get all of the paths for a particular token
	paths (id_) { return this._paths.get (id_); }
	// Get the path from a token to a target
	path (tokenId_, targetId_) { return this.paths (tokenId_)?.get (targetId_);}

	async pointsWithinRangeOfToken (token_, dist_)
	{
		return await PathManager.pointsWithinRange (this._pointFactory.segmentFromToken (token_),
							    dist_,
							    { checkCollision: true, token: token_});
	}
};

Hooks.on ("ready", () =>
{
	if (! game.FindThePath)
	{
		game.FindThePath = {
			"Chebyshev": {},
			"Euclidean": {},
			"Manhattan": {}
		};
	}

	game.FindThePath.Chebyshev.PointFactory = new PointFactory (MinkowskiParameter.Chebyshev);
	game.FindThePath.Chebyshev.PathManager = new PathManager (MinkowskiParameter.Chebyshev);

	game.FindThePath.Euclidean.PointFactory = new PointFactory (MinkowskiParameter.Euclidean);
	game.FindThePath.Euclidean.PathManager = new PathManager (MinkowskiParameter.Euclidean);

	game.FindThePath.Manhattan.PathManager = new PathManager (MinkowskiParameter.Manhattan);
	game.FindThePath.Manhattan.PointFactory = new PointFactory (MinkowskiParameter.Manhattan);

	game.FindThePath.Utility = new FTPUtility ({ name: "GlobalFTPUtility" });
});
