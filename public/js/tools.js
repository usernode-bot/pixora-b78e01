// The PIXORA tool registry.
//
// To add a tool: create a module in ./tools/ that exports
// { id, name, path, tagline, icon, render } and add one import plus one
// array entry here. The sidebar, the router and the home page cards all
// read this list, so nothing else needs to change.
import creative from './tools/creative.js';
import upscale from './tools/upscale.js';
import removeBackground from './tools/remove-background.js';

export const tools = [creative, upscale, removeBackground];
