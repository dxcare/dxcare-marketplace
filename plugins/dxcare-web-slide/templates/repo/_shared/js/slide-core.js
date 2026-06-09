import { initNavigation } from './navigation.js';
import { initFullscreen } from './fullscreen.js';
import { initDeeplink } from './deeplink.js';
import { initTheme } from './theme-toggle.js';

const deck = document.getElementById('deck');
if (!deck) throw new Error('no #deck element');

const nav = initNavigation(deck);
initFullscreen();
initDeeplink(nav);
initTheme();

window.__deck = nav;
