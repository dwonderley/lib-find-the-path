import { PointFactory, AngleTypes } from "./point.js"
import { Path } from "./pathManager.js"

export class FTPUtility
{
	constructor (path_)
	{
		if (path_ instanceof Path)
			this.path = path_;
	}

	static get defaultCollisionConfig () { return { checkCollision: true, token: null }; }

	static collision (newPoint_, collisionConfig_ = FTPUtility.defaultCollisionConfig ())
	{
		if (! collisionConfig_.checkCollision)
			return false;
	
		const pf = new PointFactory (newPoint_._metric);
	
		for (let token of canvas.tokens.placeables)
		{
			if (collisionConfig_.token && token.id === collisionConfig_.token.id)
				continue;
	
			if (pf.setFromToken (token).some (p => newPoint_.equals (p)))
				return true;
		}
	
		return false;
	}

	// Checks if a token could be moved from oldPoint_ to newPoint_
	static isTraversable (oldPoint_, newPoint_, collisionConfig_ = FTPUtility.defaultCollisionConfig ())
	{
		return ! collision (newPoint_, collisionConfig_) && los (oldPoint_, newPoint_);
	}
	
	// Moves a token_ to the specified point_
	// Assumes that oldPoint_ and newPoint_ have the same dimensions!
	static los (oldPoint_, newPoint_)
	{
		if (! oldPoint_ || oldPoint_ === newPoint_)
			return true;
	
		if (! newPoint_)
			return false;
	
		if (oldPoint_.width !== newPoint_.width || oldPoint_.height !== newPoint_.height)
		{
			console.log ("FindThePath | Invalid LoS comparison between Points of mismatching dimension");
			return false;
		}
		
		const ps1 = oldPoint_.pointSet;
		const ps2 = newPoint_.pointSet;

		// A token may take up multiple tiles, and it moves by translation from an old set to a new set. A movement is valid if, for each translation, the old tile has line of sight on the new tile and each tile in the new set has los on every other tile in the set.
		for (let i = 0; i < oldPoint_.width * oldPoint_.height; ++i)
		{
			if (canvas.walls.checkCollision (new Ray({ x: ps1[i].cpx, y: ps1[i].cpy},
								 { x: ps2[i].cpx, y: ps2[i].cpy})))
				return false;
	
			const p = { x: ps2[i].cpx, y: ps2[i].cpy };
	
			// If A has los on B then B has los on A, so we only need to check half of these
			for (let j = i + 1; j < newPoint_.width * newPoint_.height; ++j)
				if (canvas.walls.checkCollision (new Ray(p, { x: ps2[j].cpx, y: ps2[j].cpy})))
					return false;
		}

		return true;
	}
	
	// Moves a token_ to a point_
	// The token is rotated to point toward the destination before moving. There is a delay in ms, rotationWait_,
	// between this rotation and movement
	static async moveTokenToPoint (token_, point_, rotateWait_ = 100)
	{
		const pf = new PointFactory (point_._metric);
		const cur = pf.fromToken (token_);

		const dist = point_.distToPoint (cur);

		if (dist === 0)
			return true;

		// Calculate the angular distance to the destination grid space
		const dTheta = cur.radialDistToPoint (point_, token_.data.rotation, AngleTypes.DEG);
		// Rotate the token to face the direction it moves in
		await token_.update ({ rotation: (token_.data.rotation + dTheta) % 360 });
		// Wait between rotating and moving
		await new Promise (resolve => setTimeout (resolve, rotateWait_));

		let error = false;

		await token_.update ({ x: point_.px, y: point_.py }).catch (err => {
			ui.notifications.warn (err);
			error = true;
		});

		return ! error;
	}

	async traverse (distFromEnd_ = 0, rotateWait_ = 100, moveWait_ = 250)
	{
		if (! this.path.valid)
			return false;
		if (this.path.length === 0)
			return false;
		if (rotateWait_ < 0 || moveWait_ < 0)
			return false;

		// Make sure the token still exists
		const token = canvas.tokens.get (this.path?.token?.id);

		if (! token)
			return false;

		// Make sure the token is where we think it is
		const pf = new PointFactory (this.path.path[0].origin._metric);
		const start = pf.fromToken (token);

		if (! start.equals (this.path.path[0].origin))
			return false;

		if (this.path.terminus.distToDest > distFromEnd_)
			return false;

		const pathToTraverse = this.path.within (distFromEnd_);

		// pathToTraverse[i = 0] is the current point
		for (let i = 1; i < pathToTraverse.length; ++i)
		{
			const p = pathToTraverse[i];
			const success = await this.constructor.moveTokenToPoint (token, p, rotateWait_);

			if (! success)
			{
				await token.update ({ x: start.px, y: start.py }).catch (err => {
					console.log (err);
					console.log ("FindThePath | Failed to reset token to start position");
				});
				return false;
			}

			// Wait between moves
			if (i !== pathToTraverse.length - 1)
				await new Promise (resolve => setTimeout (resolve, moveWait_));
		}

		return true;
	}

	get token () { return this.path.token; }
};