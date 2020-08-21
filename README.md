# lib-find-the-path
## Summary
<p>This module provides a library that performs system-agnostic path planning calculations for two-dimensional, square grids. Hex support may be implemented in the future if there is demand for it.</p>

<p>This module is a work in progress, but I have tested it extensively. If you find bugs or have questions, comments, or requests, please don't hesitate to leave me a comment here or on the FVTT discord.</p>

<p>See the <a href="https://github.com/dwonderley/lib-find-the-path/wiki">wiki page</a> for examples of this library's use.</p>

## Functionality
<p>A Point class that is agnostic to grid size. The Point class provides ways to calculate distances, rotations, and neighbors. It has constructors for the FVTT Token class, pixel coordinates, or Point coordinates. It can also return a set of contiguous Points if a token has width/height > 1.</p>

<p>A PathManager class that provides two ways of calculating paths. First, there are the two static methods: one that finds a path between two Points and one that finds paths from a block of configuration data. However, it also provides a way of finding paths between tokens. The addToken method finds and stores the path between two tokens, origin and target.</p>

<p>A Path class that uses A* to find the optimal path. Path also provides convenient methods to help make use of the data.</p>

<p>Line of sight and collision detection. The A* algorithm is implemented such that tokens will not move through walls or on top of other tokens.</p>

<p>This module supports tokens with dimension > 1.</p>

## Future Improvements
<p>I plan to add support for hex tiles, custom heuristics, different priority measures, settings, and better handling of collision, line of sight, attack range, and failure to find paths.</p>
