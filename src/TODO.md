TODO:

https://www.tldraw.com/r/HKmlCETX11Pk76z6exDjm?v=538,595,1901,1040&p=page

implement text coord scaling by inverse of modelview:
-[x] scale the texture coordinates inversely
-[x] take the texture coordinates of the texture piece
-[x] offset by the top left of the piece within the texture
-[x] apply the opposite of the view transform:
because as we zoom in the rect gets larger, but we want the
texture to stay the same size, so we need to shrink the texture
relative to the rect, in other words scaling the texture coordinates
down
-[x] undo offset

implement clipping option 2: texture coordinates
-[x] take the top left u,v of the texture piece within the texture
-[x] discard pixels outside top left

implement correct scaling of texture rect
-[] work out ratio of rect to texture rect
-[] scale texture coords and clipping area by ratio
