// todo: support hex

// The types of distance norms typical in tile-based games
export const MinkowskiParameter =
{
	Manhattan: 1,
	Euclidean: 2,
	Chebyshev: Infinity,
}

// Relative degree offsets for neighboring *squares* in this bearing-based coordinate system
export const SquareNeighborAngles =
{
	forward: 0,
	fRight: 45,
	right: 90,
	bRight: 135,
	backward: 180,
	bLeft: 225,
	left: 270,
	fLeft: 315,
}

export const AngleTypes =
{
	RAD: 0,
	DEG: 1,
}

// Why is there no standard version of these?
export function deg2rad (deg_) { return (deg_ % 360) * Math.PI / 180; }
export function rad2deg (r_) { return (180 / Math.PI * r_) % 360 };

export function getTokenWidth (token_)
{
	if (! token_)
		return 1;

	// Round width to nearest quarter tile
	let width = Math.round (4 * token_.w / canvas.grid.size) / 4;
	return width ? width : 1;
}

export function getTokenHeight (token_)
{
	if (! token_)
		return 1;

	// Round height to nearest quarter tile
	const height = Math.round (4 * token_.h / canvas.grid.size) / 4;
	return height ? height : 1;
}

// Returns the neighbors of a Point point_
function chebyshevNeighborsFunc (point_)
{
	let n = new Array ();

	const pushIfDefined = (vector_, dx_, dy_) =>
	{
		const p = PointFactory.fromPoint (point_, dx_, dy_);
		if (p && p.isValid) vector_.push (p);
	}

	pushIfDefined (n, -1, -1);
	pushIfDefined (n, 0, -1);
	pushIfDefined (n, 1, -1);

	pushIfDefined (n, -1, 0);
	pushIfDefined (n, 1, 0);

	pushIfDefined (n, -1, 1);
	pushIfDefined (n, 0, 1);
	pushIfDefined (n, 1, 1);

	return n
}

// Returns the neighbors of a Point point_ for the Manhattan distance metric
function manhattanNeighborsFunc (point_)
{
	let n = new Array ();

	const pushIfDefined = (vector_, dx_, dy_) =>
	{
		const p = PointFactory.fromPoint (point_, dx_, dy_);
		if (p) vector_.push (p);
	}

	pushIfDefined (n, 0, -1);
	pushIfDefined (n, -1, 0);
	pushIfDefined (n, 1, 0);
	pushIfDefined (n, 0, 1);

	return n
}

// Represents a token's position as a point in grid-space rather than pixel-space and provides some useful methods.
export class Point
{
	constructor (data_)
	{
		if (data_.px)
			this._x = data_.px / this.scale;
		else if (data_.x)
			this._x = data_.x;
		else
			this._x = 0;

		if (data_.py)
			this._y = data_.py / this.scale;
		else if (data_.y)
			this._y = data_.y;
		else
			this._y = 0;

		// todo: Could represent difficult terrain, elevation, tile type (square/hex)...
		this.data = data_.data;

		// The "L_0-norm" is not valid, so we don't have to check for it
		if (data_.metric)
		{
			this._metric = data_.metric;
		}
		else
		{ 
			switch (game.system.id)
			{
			// D&D 5E uses the Chebyshev norm (adjacent + diagonals)
			case ("dnd5e"):
				this._metric = MinkowskiParameter.Chebyshev;
				break;
			default:
				this._metric = MinkowskiParameter.Manhattan;
				break;
			}
		}

		const determineNeighborsFunc = () => {
				if (data_.neighborsFunc)
					return data_.neighborsFunc;

				if (this._metric === MinkowskiParameter.Chebyshev)
					return chebyshevNeighborsFunc;

				return manhattanNeighborsFunc;
			} ;

		this.neighborsFunc = determineNeighborsFunc ();
	}

	// Calculate the distance between Points p1 and p2 using the L-norm
	static lp (p1_, p2_, p_)
	{
		if (p_ === MinkowskiParameter.Chebyshev)
			return Point.Chebyshev (p1_, p2_);
		if (p_ === MinkowskiParameter.Manhattan)
			return Point.Manhattan (p1_, p2_);
		if (p_ === MinkowskiParameter.Euclidean)
			return Point.Euclidean (p1_, p2_);
		if (p_ <= 0)
			return undefined

		console.log ("FindThePath | Using L_%f-norm?!", p_);
		// Why am I supporting this? Why are you using this? What hellish system are you implementing?
		return Math.pow (Math.pow (Math.abs (p1_.x - p2_.x), p_) + Math.pow (Math.abs (p1_.y - p2_.y), p_), 1/p);
	}
	// L_infinity-norm (i.e. DnD 5e's default distance metric)
	static Chebyshev (p1_, p2_)
	{
		return Math.max (Math.abs (p1_.x - p2_.x), Math.abs (p1_.y - p2_.y))
	};
	// L_1-norm
	static Manhattan (p1_, p2_)
	{
		return Math.abs (p1_.x - p2_.x) + Math.abs (p1_.y - p2_.y);
	}
	// L_2-norm
	static Euclidean (p1_, p2_)
	{
		return Math.hypot (p1_.x - p2_.x, p1_.y - p2_.y)
	};

	distToPoint (p_)     { return Point.lp (this, p_, this.metric); }
	// Minimum distance from this point to a coordinate with width w_ and height h_
	distToCoord (x_, y_, w_ = 1, h_ = 1)
	{
		let min = Infinity;
		let point = new Point ({
			"x": x_,
			"y": y_,
			"w": w_,
			"h": h_,
			"data": null,
			"metric": this.metric
		})

		for (let i = 0; i < w_; ++i)
		{
			for (let j = 0; j < h_; ++j)
			{
				let dist = this.distToPoint (PointFactory.fromPoint (point, i, j));
				if (dist < min) min = dist;
			}
		}

		return min;
	} 
	distToSegment (segment_)
	{
		return this.distToCoord (segment_.point.x, segment_.point.y, segment_.width, segment_.height);
	}

	equals (p_) { return this.x === p_.x && this.y === p_.y; }
	isNeighbor (p_) { return this.distToPoint (p_) === 1; }

	// If a token is at point P with rotation r_, this function returns the relative neighbor of that token in dir_ direction (e.g. forward, to the left, behind-left)
	neighbor (dir_, r_)
	{
		const theta = deg2rad (r_ + dir_);
		const dx = - Math.sin (theta);
		const dy = Math.cos (theta);

		if (this.metric === MinkowskiParameter.Chebyshev)
			return PointFactory.fromPoint (this, Math.round (dx), Math.round (dy));

		// Otherwise, the token can only move adjacently. This means that it can only change either the x or y
		// coordinate. We will have it take the bigger movement

		const adx = Math.abs (dx);
		const ady = Math.abs (dy);

		if (adx > ady || (adx === ady && Math.random () > 0.5))
			return PointFactory.fromPoint (this, Math.sign (dx), 0);

		return PointFactory.fromPoint (this, 0, Math.sign (dy));
	}

	// Gets all of this point's neighbors
	// This isn't particularly well-defined for the Euclidean metric
	neighbors () { return this.neighborsFunc (this); }

	/* Deprecated */
	// For a rotation_, find the neighboring Point of a target that is closest to this Point
	closestNeighborOfToken (target_, rotation_)
	{
		let maxDist = Infinity;
		let maxRDist = Math.PI;
		let closestNeighbor;

		const pf = new PointFactory (this.metric)

		for (let n of pf.fromToken (target_).neighbors ())
		{
			const dist = Point.Euclidean(this, n);
			const rDist = Math.abs (this.radialDistToPoint (n, rotation_, AngleTypes.RAD));

			if (dist > maxDist) continue;
			if (dist === maxDist && rDist > maxRDist) continue;

			closestNeighbor = n;
			maxDist = dist;
			maxRDist = rDist;
		}

		return closestNeighbor;
	}

	// Returns the angle that, applied to a token with rotation r_, will orient the token toward Point p_
	// e.g. A token with rotation of 45 deg wants to rotate toward a tile one square below and to the right
	// of its current position ((dx, dy) = (+1, +1) wrt the grid). The angle from the token's position to the
	// target square is -45 deg (if that doesn't make sense to you, see comment below), so this function will
	// output -pi/2.
	// Bounded on [-pi, pi]
	radialDistToPoint (p_, r_, angleType_)
	{
		const M_2PI  = 2 * Math.PI;

		// This coordinte system is quite insane, graphics conventions be damned.
		// The x and y axes are flipped (angle starts from y)
		// The angle increase has inverse sign ((+x, +y) -> -theta)
		// The conversion (from Cartesian) is:
		// x -> -x
		// y -> +y
		// theta -> pi/2 - theta
		// E.g. atan2(y/x) -> -atan2(x/y) = atan2(-x/y)
		const dx = p_.x - this.x;
		const dy = p_.y - this.y;
		// Bounded between [-pi, pi]
		const angleToPoint = Math.atan2 (-dx, dy);

		// Bounded between [0, 2pi] (see deg2rad)
		const rotation = deg2rad ((r_ % 360) + 360);
		// Bounded between [-3PI, PI]
		const out = angleToPoint - rotation;
		// Return an an angle between [-pi, pi]
		const ret = out + (out < - Math.PI ? M_2PI : 0);

		if (angleType_ === AngleTypes.DEG)
			return rad2deg (ret);

		return ret;
	}

	radialDistToToken (token_, rotation_, angleType_)
	{
		return this.radialDistToPoint ((new PointFactory (this.metric)).fromToken (token_), rotation_, angleType_);
	}

	// In JS, numbers are not references, so we have to update these when they change
	update (changes_)
	{
		if (changes_.x !== undefined)
			this._x = changes_.x / this.scale;
		if (changes_.y !== undefined)
			this._y = changes_.y / this.scale;
		if (changes_.w !== undefined)
			this._w = changes_.w / this.scale;
		if (changes_.h !== undefined)
			this._h = changes_.h / this.scale;
	}

	get x () { return this._x; }
	get y () { return this._y; }
	// x and y offset, in pixels
	get px () { return this.x * this.scale; }
	get py () { return this.y * this.scale; }
	// Returns the offset of the point's center, in pixels
	get cx () { return this.x + 0.5; }
	get cy () { return this.y + 0.5; }
	// Returns the offset of the point's center, in pixels
	get cpx () { return (this.x + 0.5) * this.scale; }
	get cpy () { return (this.y + 0.5) * this.scale; }

	get scale () { return canvas.grid.size; }

	get metric () { return this._metric; }
	set metric (minkowskiParameter_) { this.metric = minkowskiParameter_; };

	// todo: don't do this? return pixel pair instead?
	// Don't use center points for calculations!!
	get center () { return PointFactory.fromPoint (this, .5, .5); }

	get id () { return this.x + "," + this.y; }
	get isValid ()
	{
		if (this.x === NaN || this.y === NaN)
			return false;
		if (this.x < 0 || this.y < 0)
			return false;
		if (this.px >= canvas.dimensions.width || this.py >= canvas.dimensions.height)
			return false;

		return true;
	}
};

export class Segment
{
	constructor (point_, w_ = 1, h_ = 1)
	{
		this._point = point_;
		this._w = w_;
		this._h = h_;

		this._pointSet = new Array ();

		this._center = new Point ({
			"x": this.point.x + this.width / 2,
			"y": this.point.y + this.height / 2,
			"data": this.point.data,
			"metric": this.metric,
			"neighborsFunc": this.point.neighborsFunc
		})
	}

	contains (point_)
	{
		return ! (point_.x < this.point.x
		       || point_.y < this.point.y
		       || point_.x >= this.point.x + this.width
		       || point_.y >= this.point.y + this.height);
	}

	distToCoord (x_, y_, w_ = 1, h_ = 1)
	{
		let min = Infinity;

		for (let point of this.pointSet)
		{
			let dist = point.distToCoord (x_, y_, w_, h_);
			if (dist < min) min = dist;
		}

		return min;
	}

	distToPoint (point_) { return this.distToCoord (point_.x, point_.y); }

	distToSegment (segment_)
	{
		let min = Infinity;

		for (let point of this.pointSet)
		{
			let dist = point.distToSegment (segment_);
			if (dist < min) min = dist;
		}

		return min;
	}

	// Checks if two segments are equivalent (same origin and dimensions)
	equals (seg_) { return this.id === seg_.id; }
	// Checks if two segments share an origin
	equalsNoSize (seg_) { return this.point.equals (seg_.point); }

	radialDistToSegment (seg_, rotation_, angleType_)
	{
		return this.center.radialDistToPoint (seg_.center, rotation_, angleType_);
	}

	// todo: optimize
	shared (segment_)
	{
		let ret = new Array ();

		for (let point of this.pointSet)
			if (segment_.contains (point))
				ret.push (point);

		return ret;
	}
	
	// See Point.neighbor
	neighbor (dir_, r_)
	{
		return new Segment (this.point.neighbor (dir_, r_), this.width, this.height);
	}

	update (changes_)
	{
		this.point.update (changes_);
		this._pointSet = new Array ();
	}

	get center () { return this._center; }

	get id () { return this.point.id + "," + this.width + "," + this.height; }
	get isValid ()
	{
		if (! this.point.isValid)
			return false;

		const gridWidth = canvas.dimensions.width / canvas.dimensions.size;
		const gridHeight = canvas.dimensions.height / canvas.dimensions.size;

		if (this.point.x + this.width > gridWidth || this.point.y + this.height > gridHeight)
			return false;

		return true;
	}
	get metric () { return this._point.metric; }
	get point () { return this._point; }
	get pointSet ()
	{ 
		if (this._pointSet.length === 0)
			for (let i = 0; i < this._w; ++i)
				for (let j = 0; j < this._h; ++j)
					this._pointSet.push (PointFactory.fromPoint (this._point, i, j));

		return this._pointSet;
	}

	get width () { return this._h; }
	get height () { return this._w; }
	get pw () { return this.width * canvas.grid.size; }
	get ph () { return this.height * canvas.grid.size; }
}

export class PointFactory
{
	// metric_ is a MinkowskiParameter
	constructor (metric_ = MinkowskiParameter.Manhattan)
	{
		this.metric = metric_;
	}

	static fromPoint (point_, dx_ = 0, dy_ = 0)
	{
		const p = new Point ({
			"x": point_.x + dx_,
			"y": point_.y + dy_,
			"data": point_.data,
			"metric": point_.metric,
			"neighborsFunc": point_.neighborsFunc
		});
		return p.isValid ? p : null;
	}

	static segmentFromPoint (point_, w_ = 1, h_ = 1) { return new Segment (point_, w_, h_); }

	// Returns a new Point from x and y offsets: top left corner of canvas to top left corner of tile, in grid squares. If that Point is invalid, it returns null
	fromCoord (x_, y_, data_)
	{
		const p = new Point ({
			"x": x_,
			"y": y_,
			"data": data_,
			"metric": this.metric
		});
		return p.isValid ? p : null;
	}
	fromData (data_)
	{
		const p = new Point (data_);
		return p.isValid ? p : null;
	}
	fromPixel (px_, py_, data_ = null)
	{
		const p = new Point ({
			"px": px_,
			"py": py_,
			"data": data_,
			"metric": this.metric
		});
		return p.isValid ? p : null;
	}
	// While the other factory methods may return null, this one will always return a Point
	fromToken (token_, data_ = null)
	{
		return new Point ({
			"px": token_.x,
			"py": token_.y,
			"data": data_,
			"metric": this.metric
		});
	}

	// Returns a Point located at the center of a token's location on the canvas, rather than the location of its top-left corner
	// Useful for rotating tokens to "look" at each other, but not recommended for general use. A number of methods simply will not work
	// todo: remove?
	centerFromToken (token_, data_ = null)
	{
		return this.fromPixel (token_.x + token_.w / 2, token_.y + token_.h / 2, data_);
	}

	// A token with dimensions > 1x1 is represented by a grid Segment: an array of points. The first element in the array represents the top-left Point
	segmentFromCoord (x_, y_, w_ = 1, h_ = 1) { return new Segment (this.fromCoord (x_, y_), w_, h_); }
	segmentFromData (data_, w_ = 1, h_ = 1) { return new Segment (this.fromData (data_), w_, h_); }
	segmentFromToken (token_)
	{
		return new Segment (this.fromToken (token_), getTokenWidth (token_), getTokenHeight (token_));
	}
};
