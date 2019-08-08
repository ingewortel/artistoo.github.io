import Grid from "./Grid.js"

/** A class containing (mostly static) utility functions for dealing with 2D 
 	grids. Extends the Grid class but implements functions specific to the 2D
 	grid (such as neighborhoods). 
 	
	@example <caption>Diffusion on a 2D chemokine grid</caption>
 	* 
 	* let CPM = require("path/to/build")
 	* 
 	* // Make a grid with a chemokine, add some chemokine at the middle pixel
 	* let chemogrid = new CPM.Grid2D( [100,100], true, "Float32" )
 	* chemogrid.setpix( [50,50], 100 )
 	* 
 	* // Measure chemokine at different spots before and after diffusion
 	* let p1 = [50,50], p2 = [50,51]
 	* console.log( "p1: " + chemogrid.pixt( p1 ) + ", p2: " + chemogrid.pixt(p2) )
 	* chemogrid.diffusion( 0.001 )
 	* console.log( "p1: " + chemogrid.pixt( p1 ) + ", p2: " + chemogrid.pixt(p2) )
 	* chemogrid.multiplyBy( 0.9 )	 // decay of the chemokine
 	* console.log( "p1: " + chemogrid.pixt( p1 ) + ", p2: " + chemogrid.pixt(p2) )
 	
 	@example <caption>Neighborhoods on a 2D grid</caption>
 	* 
 	* let CPM = require("path/to/build")
 	* 
 	* // Make a grid with a torus, and find the neighborhood of the upper left pixel [0,0]
 	* let grid = new CPM.Grid2D( [100,100], true )
 	* console.log( grid.neigh( [0,0] ) ) // returns coordinates of 8 neighbors
 	* 
 	* // Now try a grid without torus; the corner now has fewer neighbors.
 	* let grid2 = new CPM.Grid2D( [100,100], false )
 	* console.log( grid2.neigh( [0,0] ) ) // returns only 3 neighbors
 	* 
 	* // Or try a Neumann neighborhood using the iterator
 	* for( let i of grid.neighNeumanni( 0 ) ){
 	* 	console.log( grid.i2p(i).join(" ") )
 	* }
 	*/

class Grid2D extends Grid {

	/** Constructor of the Grid2D object.
	@param {GridSize} extents - the size of the grid in each dimension 
	@param {boolean} [torus = true] - should the borders of the grid be linked, so that a cell moving
	out on the left reappears on the right?
	@param {string} [datatype="Uint16"] - What datatype are the values associated with each
	pixel on the grid? Choose from "Uint16" or "Float32". */
	constructor( extents, torus=true, datatype="Uint16" ){
		super( extents, torus )
		
		/** @ignore */
		this.X_STEP = 1 << this.Y_BITS // for neighborhoods based on pixel index
		/** @ignore */
		this.Y_MASK = this.X_STEP-1
		// Check that the grid size is not too big to store pixel ID in 32-bit number,
		// and allow fast conversion of coordinates to unique ID numbers.
		if( this.X_BITS + this.Y_BITS > 32 ){
			throw("Field size too large -- field cannot be represented as 32-bit number")
		}
		// Attributes per pixel:
		// celltype (identity) of the current pixel.
		if( datatype == "Uint16" ){
			/** Array with values for each pixel stored at the position of its 
			{@link IndexCoordinate}. E.g. the value of pixel with coordinate i is
			stored as this._pixels[i].
			@private
			@type {Uint16Array|Float32Array} */
			this._pixels = new Uint16Array(this.p2i(this.extents))
		} else if( datatype == "Float32" ){
			this._pixels = new Float32Array(this.p2i(this.extents))
		} else {
			throw("unsupported datatype: " + datatype)
		}
	}

	/** This iterator returns locations and values of all non-zero pixels.

		@return {iPixel} for each pixel, return an array [i,v] where i is
		the pixel's {@link IndexCoordinate} on the grid, and v its value.
		
		@example
		* let CPM = require( "path/to/build" )
		* // make a grid and set some values
		* let grid = new CPM.Grid2D( [100,100], true )
		* grid.setpixi( 0, 1 )
		* grid.setpixi( 1, 5 )
		* 
		* // iterator
		* for( let i of grid.pixelsi() ){
		* 	console.log( i )
		* }
		*/
	* pixelsi() {
		let ii = 0, c = 0
		for( let i = 0 ; i < this.extents[0] ; i ++ ){
			for( let j = 0 ; j < this.extents[1] ; j ++ ){
				yield ii
				ii ++
			}
			c += this.X_STEP
			ii = c
		}
	}
	
	/** This iterator returns locations and values of all non-zero pixels.

		@return {Pixel} for each pixel, return an array [p,v] where p are
		the pixel's array coordinates on the grid, and v its value.
		
		@example
		* let CPM = require( "path/to/build" )
		* // make a grid and set some values
		* let grid = new CPM.Grid2D( [100,100], true )
		* grid.setpix( [0,0], 1 )
		* grid.setpix( [0,1], 5 )
		* 
		* // iterator
		* for( let p of grid.pixels() ){
		* 	console.log( p )
		* }
		*/
	* pixels() {
		let ii = 0, c = 0
		// Loop over coordinates [i,j] on the grid
		// For each pixel with cellid != 0 (so non-background pixels), 
		// return an array with in the first element the pixel 
		// coordinates p = [i,j], and in the second element the cellid of this pixel.
		for( let i = 0 ; i < this.extents[0] ; i ++ ){
			for( let j = 0 ; j < this.extents[1] ; j ++ ){
				if( this._pixels[ii] > 0 ){
					yield [[i,j], this._pixels[ii]]
				}
				ii ++
			}
			c += this.X_STEP
			ii = c
		}
	}

	/**	??? OLD METHOD
		@todo check if this method is still used.
		@ignore
		Return array of {@link IndexCoordinate} of neighbor pixels of the pixel at 
		coordinate i. This function takes the 2D Moore neighborhood.
		@param {IndexCoordinate} i - location of the pixel to get neighbors of.
		@return {IndexCoordinate[]} - an array of coordinates for all the neighbors of i.
	*/
	neighisimple( i ){
		let p = this.i2p(i)
		let xx = []
		for( let d = 0 ; d <= 1 ; d ++ ){
			if( p[d] == 0 ){
				if( this.torus[d] ){
					xx[d] = [p[d],this.extents[d]-1,p[d]+1]
				} else {
					xx[d] = [p[d],p[d]+1]
				}
			} else if( p[d] == this.extents[d]-1 ){
				if( this.torus[d] ){
					xx[d] = [p[d],p[d]-1,0]
				} else {
					xx[d] = [p[d],p[d]-1]
				}
			} else {
				xx[d] = [p[d],p[d]-1,p[d]+1]
			}
		}

		let r = [], first=true
		for( let x of xx[0] ){
			for( let y of xx[1] ){
				if( first ){
					first = false 
				} else {
					r.push( this.p2i( [x,y] ) )
				}
			}
		}
		return r
	}
	
	/**	Return array of {@link IndexCoordinate} of von Neumann-4 neighbor pixels 
		of the pixel at 
		coordinate i. This function takes the 2D Neumann-4 neighborhood, excluding the
		pixel itself.
		@see https://en.wikipedia.org/wiki/Von_Neumann_neighborhood
		@param {IndexCoordinate} i - location of the pixel to get neighbors of.
		@param {boolean} [torus] - does the grid have linked borders? Defaults to the
		setting on this grid, see {@link torus}
		@return {IndexCoordinate[]} - an array of coordinates for all the neighbors of i.
	*/
	* neighNeumanni( i, torus = this.torus ){
		// normal computation of neighbor indices (top left-middle-right, 
		// left, right, bottom left-middle-right)
		let t = i-1, l = i-this.X_STEP, r = i+this.X_STEP, b = i+1
		
		// if pixel is part of one of the borders, adjust the 
		// indices accordingly
		// if torus is false, return NaN for all neighbors that cross
		// the border.

		// left border
		if( i < this.extents[1] ){
			if( torus ){
				l += this.extents[0] * this.X_STEP
				yield l
			} 
		} else {
			yield l
		}
		// right border
		if( i >= this.X_STEP*( this.extents[0] - 1 ) ){
			if( torus ){
				r -= this.extents[0] * this.X_STEP
				yield r
			}
		} else {
			yield r
		}
		// top border
		if( i % this.X_STEP == 0 ){
			if( torus ){
				t += this.extents[1]
				yield t
			} 
		} else {
			yield t
		}
		// bottom border
		if( (i+1-this.extents[1]) % this.X_STEP == 0 ){
			if( torus ){
				b -= this.extents[1]
				yield b
			} 
		} else {
			yield b
		}
	}
	/**	Return array of {@link IndexCoordinate} of Moore-8 neighbor pixels of the pixel at 
		coordinate i. This function takes the 2D Moore-8 neighborhood, excluding the
		pixel itself.
		@see https://en.wikipedia.org/wiki/Moore_neighborhood
		@param {IndexCoordinate} i - location of the pixel to get neighbors of.
		@param {boolean} [torus] - does the grid have linked borders? Defaults to the
		setting on this grid, see {@link torus}
		@return {IndexCoordinate[]} - an array of coordinates for all the neighbors of i.
	*/
	neighi( i, torus = this.torus ){	
		// normal computation of neighbor indices (top left-middle-right, 
		// left, right, bottom left-middle-right)
		let tl, tm, tr, l, r, bl, bm, br
		
		tl = i-1-this.X_STEP; tm = i-1; tr = i-1+this.X_STEP
		l = i-this.X_STEP; r = i+this.X_STEP
		bl = i+1-this.X_STEP; bm = i+1; br = i+1+this.X_STEP
		
		// if pixel is part of one of the borders, adjust the 
		// indices accordingly
		let add = NaN // if torus is false, return NaN for all neighbors that cross
		// the border.
		// 
		// left border
		if( i < this.extents[1] ){
			if( torus ){
				add = this.extents[0] * this.X_STEP
			}
			tl += add; l += add; bl += add 	
		}
		
		// right border
		if( i >= this.X_STEP*( this.extents[0] - 1 ) ){
			if( torus ){
				add = -this.extents[0] * this.X_STEP
			}
			tr += add; r += add; br += add
		}

		// top border
		if( i % this.X_STEP == 0 ){
			if( torus ){
				add = this.extents[1]
			}
			tl += add; tm += add; tr += add	
		}
		
		// bottom border
		if( (i+1-this.extents[1]) % this.X_STEP == 0 ){
			if( torus ){
				add = -this.extents[1]
			}
			bl += add; bm += add; br += add
		}
		if( !torus ){
			return [ tl, l, bl, tm, bm, tr, r, br ].filter( isFinite )
		} else {
			return [ tl, l, bl, tm, bm, tr, r, br ]
		}
	}
	
	/** Method for conversion from an {@link ArrayCoordinate} to an {@link IndexCoordinate}.
	
	See also {@link Grid2D#i2p} for the backward conversion.
	
	@param {ArrayCoordinate} p - the coordinate of the pixel to convert
	@return {IndexCoordinate} the converted coordinate. 
	
	@example 
	* let grid = new CPM.Grid2D( [100,100], true )
	* let p = grid.i2p( 5 )
	* console.log( p )
	* console.log( grid.p2i( p ))
	*/
	p2i ( p ){
		return ( p[0] << this.Y_BITS ) + p[1]
	}
	/** Method for conversion from an {@link IndexCoordinate} to an {@link ArrayCoordinate}.
	
	See also {@link Grid2D#p2i} for the backward conversion.
	
	@param {IndexCoordinate} i - the coordinate of the pixel to convert
	@return {ArrayCoordinate} the converted coordinate. 
	
	@example 
	* let grid = new CPM.Grid2D( [100,100], true )
	* let p = grid.i2p( 5 )
	* console.log( p )
	* console.log( grid.p2i( p ))
	*/
	i2p ( i ){
		return [i >> this.Y_BITS, i & this.Y_MASK]
	}
	
	/** Method to compute the gradient at location i on the grid
	(location given as an {@link IndexCoordinate}).
	@param {IndexCoordinate} i - index coordinate of a pixel to compute the gradient at
	@return {number} the gradient at position i.
	@see https://en.wikipedia.org/wiki/Gradient*/
	gradienti( i ){
		let t = i-1, b = i+1, l = i-this.X_STEP, r = i+this.X_STEP, torus = this.torus
		
		let dx=0
		if( i < this.extents[1] ){ // left border
			if( torus ){
				l += this.extents[0] * this.X_STEP
				dx = ((this._pixels[r]-this._pixels[i])+
					(this._pixels[i]-this._pixels[l]))/2
			} else {
				dx = this._pixels[r]-this._pixels[i]
			}
		} else { 
			if( i >= this.X_STEP*( this.extents[0] - 1 ) ){ // right border
				if( torus ){
					r -= this.extents[0] * this.X_STEP
					dx = ((this._pixels[r]-this._pixels[i])+
						(this._pixels[i]-this._pixels[l]))/2
				} else {
					dx = this._pixels[i]-this._pixels[l]
				}
			} else {
				dx = ((this._pixels[r]-this._pixels[i])+
					(this._pixels[i]-this._pixels[l]))/2
			}
		}

		let dy=0
		if( i % this.X_STEP == 0 ){ // top border
			if( torus ){
				t += this.extents[1]
				dy = ((this._pixels[b]-this._pixels[i])+
					(this._pixels[i]-this._pixels[t]))/2
			}	else {
				dy = this._pixels[b]-this._pixels[i]
			}
		} else { 
			if( (i+1-this.extents[1]) % this.X_STEP == 0 ){ // bottom border
				if( torus ){
					b -= this.extents[1]
					dy = ((this._pixels[b]-this._pixels[i])+
						(this._pixels[i]-this._pixels[t]))/2
				} else {
					dy = this._pixels[i]-this._pixels[t]
				}
			} else {
				dy = ((this._pixels[b]-this._pixels[i])+
					(this._pixels[i]-this._pixels[t]))/2
			}
		}
		return [
			dx, dy
		]
	}
}



export default Grid2D 
