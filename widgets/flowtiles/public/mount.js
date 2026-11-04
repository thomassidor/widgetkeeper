/*
 * Wires createFlowTilesWidget to Homey: the settings, the app's API and its realtime events (a board's tiles, which
 * Flow cards write). index.html calls it with the frame's own Homey and body; the Smart Stack calls it with a slide of
 * its page and a Homey of its own. `frame` is the element whose height Homey gets (the body, or the slide).
 */
window.mountFlowTilesWidget = function (Homey, { root, frame }) {
  // The events keep it current; this catches a missed one (a screen that slept).
  const REFRESH_MS = 5 * 60e3;

  const { wireFrame } = window.WidgetkeeperKit;
  // Homey's frame: ready, the height, and the load marks sent with the first request.
  const link = wireFrame(Homey, frame);

  const settings = Homey.getSettings() || {};
  // The board: an autocomplete item whose id is its name; none picked is Tiles.
  const board = settings.board && typeof settings.board === 'object' && typeof settings.board.id === 'string' ? settings.board.id : '';
  const key = window.flowTileKey(board, 'Tiles');
  let loaded = false;
  let loadedAt = 0;

  const widget = window.createFlowTilesWidget(root, {
    t: (k, tokens) => Homey.__(k, tokens),
    columns: settings.columns,
    tileStyle: settings.tileStyle,
    colorStyle: settings.colorStyle,
    order: settings.order,
    only: typeof settings.only === 'string' ? settings.only : '',
    showAge: settings.showAge === true,
    tapEffect: settings.tapEffect,
    onTap: async (tile) => {
      try { Homey.hapticFeedback(); } catch (e) { /* only right after a touch */ }
      await Homey.api('POST', '/tap', { board, tile });
    },
    onHeight: link.setHeight,
  });

  // Shown once the text font has loaded (at most 1 s), so the text doesn't pop in after the icons.
  function ready() {
    return link.ready({ fonts: true });
  }

  async function load() {
    loadedAt = Date.now();
    try {
      widget.setState(await Homey.api('GET', `/state?board=${encodeURIComponent(board)}${link.perfParam()}`));
      loaded = true;
    } catch (err) {
      console.error(err);
      // A failed refresh keeps the tiles; only a failed first load replaces them with the error.
      widget.setMessage(widget.t('error'), loaded);
    }
    ready();
  }

  Homey.on('flowtiles:state', (entry) => widget.pushBoard(entry, key));

  // The time of a change (Show when it changed) moves on by itself: drawn again each minute.
  if (settings.showAge === true) setInterval(() => widget.render(), 60e3);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - loadedAt >= REFRESH_MS) load();
  });
  setInterval(load, REFRESH_MS);
  load();
};
/** The classes index.html puts on its body; the Smart Stack puts them on the slide. */
window.mountFlowTilesWidget.frameClass = 'homey-widget-full';
