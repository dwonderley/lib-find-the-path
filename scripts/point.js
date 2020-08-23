// todo: support hex

// The types of distance norms typical in tile-based games
export const MinkowskiParameter =
{
	Manhattan: 1,
	Euclidean: 2,
	Chebyshev: Infinity,
}

// Relative degree offsets for neighboring *squares* in this bearing-based coordinate system
export const Neighbors =
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

	let width = Math.floor (token_.w / canvas.grid.size);
	return width ? width : 1;
}

export function getTokenHeight (token_)
{
	if (! token_)
		return 1;

	const height = Math.floor (token_.h / canvas.grid.size);
	return height ? height : 1;
}

// Tokens are rectangular. This means that if the first and last Points lie within the canvas then all of them do.
export function isPointSetValid (ps_)
{
	return ps_ && ps_[0] && ps_[ps_.length - 1];
}

// Returns the neighbors of a Point point_
function chebyshevNeighborsFunc (point_)
{
	let n = new Array ();

	const pushIfDefined = (vector_, dx_, dy_) =>
	{
		const p = PointFactory.fromPoint (point_, dx_, dy_);
		if (p) vector_.push (p);
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
		else
			this._x = data_.x;

		if (data_.py)
			this._y = data_.py / this.scale;
		else
			this._y = data_.y;

		this._w = data_.width ? data_.width : 1;
		this._h = data_.height ? data_.height : 1;

		// We don't want to create this array for every Point. It is created as needed and stored then
		this._pointSet = new Array ();

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
	distToCoord (x_, y_, w_, h_)
	{
		const ps1 = this.pointSet;
		const ps2 = new Point ({
			"x": x_,
			"y": y_,
			"width": w_,
			"height": h_,
			"data": undefined,
			"metric": this.metric,
		}).pointSet;

		return Math.min (...ps1.map (p1 =>
			Math.min (...ps2.map (p2 =>
				Point.lp (p1, p2, this.metric)))));
	} 
	equals (p_)          { return this.x === p_.x && this.y === p_.y; }
	isNeighbor (p_)      { return this.distToPoint (p_) === 1; }

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
	neighbors ()
	{
		return this.neighborsFunc (this);
	}

	/* Deprecated */
	// For a rotation_, find the neighboring Point of a target that is closest to this Point
	closestNeighborOfToken (target_, rotation_)
	{
		let maxDist = Infinity;
		let maxRDist = Math.PI;
		let closestNeighbor;

		for (let n of (new TokenPoint (target_)).neighbors ())
		{
			const dist = Point.Euclidean(this, n);
			const rDist = Math.abs (this.radialDistToPoint (n, rotation_));

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
		return this.radialDistToPoint (new TokenPoint (token_), rotation_, angleType_);
	}

	// In JS, numbers are not references, so we have to update these when they change
	update (px_, py_, width_, height_)
	{
		this._x = px_ / this.scale;
		this._y = py_ / this.scale;
		this._w = width_ ? width_ / this.scale: 1;
		this._h = height_ ? height_ / this.scale : 1;
	}

	get x () { return this._x; }
	get y () { return this._y; }
	// x and y offset, in pixels
	get px () { return this.x * this.scale; }
	get py () { return this.y * this.scale; }
	// Returns the offset of the point's center, in pixels
	get cpx () { return (this.x + 0.5) * this.scale; }
	get cpy () { return (this.y + 0.5) * this.scale; }

	get width () { return this._w; }
	get height () { return this._h; }
	get pw () { return this.width * this.scale; }
	get ph () { return this.height * this.scale; }

	get pointSet ()
	{
		if (this._pointSet.length === 0)
			for (let i = 0; i < this._w; ++i)
				for (let j = 0; j < this._h; ++j)
					this._pointSet.push (PointFactory.fromPoint (this, i, j));

		return this._pointSet;
	}

	get scale () { return canvas.grid.size; }

	get metric () { return this._metric; }
	set metric (minkowskiParameter_) { this.metric = minkowskiParameter_; };

	get isValid ()
	{
		if (this.x === NaN || this.y === NaN)
			return false;
		if (this.x < 0 || this.y < 0)
			return false;
		if (this.px >= canvas.dimensions.sceneWidth || this.py >= canvas.dimensions.sceneHeight)
			return false;

		return true;
	}
};

export class PointFactory
{
	// metric_ is a MinkowskiParameter
	constructor (metric_)
	{
		this.metric = metric_;
	}

	static fromPoint (point_, dx_ = 0, dy_ = 0)
	{
		const p = new Point ({
			"x": point_.x + dx_,
			"y": point_.y + dy_,
			"width": point_.width,
			"height": point_.height,
			"data": point_.data,
			"metric": point_.metric,
			"neighborsFunc": point_.neighborsFunc
		});
		return p.isValid ? p : undefined;
	}

	// Returns a new Point from x and y offsets: top left corner of canvas to top left corner of tile, in grid squares. If that Point is invalid, it returns undefined
	fromCoord (x_, y_, w_, h_, data_)
	{
		const p = new Point ({
			"x": x_,
			"y": y_,
			"width": w_,
			"height": h_,
			"data": data_,
			"metric": this.metric
		});
		return p.isValid ? p : undefined;
	}
	fromData (data_)
	{
		const p = new Point (data_);
		return p.isValid ? p : undefined;
	}
	fromPixel (px_, py_, w_, h_, data_)
	{
		const p = new Point ({
			"px": px_,
			"py": py_,
			"width": w_,
			"height": h_,
			"data": data_,
			"metric": this.metric
		});
		return p.isValid ? p : undefined;
	}
	fromToken (token_, data_)
	{
		return new Point ({
			"px": token_.x,
			"py": token_.y,
			"width": getTokenWidth (token_),
			"height": getTokenHeight (token_),
			"data": data_,
			"metric": this.metric
		});
	}

	// Returns a Point located at the center of a token's location on the canvas, rather than the location of its top-left corner
	// Useful for rotating tokens to "look" at each other, but not recommended for general use. A number of methods simply will not work, such as neighbors () or pointSet ()
	centerFromToken (token_, data_)
	{
		return this.fromPixel (token_.x + token_.w / 2,
				       token_.y + token_.h / 2,
				       getTokenWidth (token_),
				       getTokenHeight (token_),
				       data_);
	}

	// A token with dimensions > 1x1 is represented by an array of points for the purposes of los, collision detection, and path planning. The first element in the array represents the top-left Point
	setFromData (data_) { return this.fromData (data_)?.pointSet; }
	setFromCoord (x_, y_, w_, h_) { return this.fromCoord (x_, y_, w_, h_)?.pointSet; }
	setFromToken (token_) { return this.fromToken (token_).pointSet; }
};
