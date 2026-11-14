/*
 * Wires createFlowTilesWidget to Homey: the settings, the app's API and its realtime events (a board's tiles, which
 * Flow cards write). index.html calls it with the frame's own Homey and body; the Smart Stack calls it with a slide of
 * its page and a Homey of its own. `frame` is the element whose height Homey gets (the body, or the slide).
 */
window.mountFlowTilesWidget = function (Homey, { root, frame }) {
  const haptic = window.WidgetkeeperKit.wireHaptic(Homey); // a tap that acts vibrates
  const { wireFrame, wireTimeFormat, wireRefresh } = window.WidgetkeeperKit;
  // Homey's frame: ready, the height, and the load marks sent with the first request.
  const link = wireFrame(Homey, frame);
  window.WidgetkeeperKit.wireTileShadow(Homey); // the app's Tile shadows (kit.css)

  const settings = Homey.getSettings() || {};
  // The board: an autocomplete item whose id is its name; none picked is Tiles.
  const board = settings.board && typeof settings.board === 'object' && typeof settings.board.id === 'string' ? settings.board.id : '';
  const key = window.flowTileKey(board, 'Tiles');
  let loaded = false;
  let loadSeq = 0; // only the latest load's answer counts
  let loading = false;

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
      haptic();
      await Homey.api('POST', '/tap', { board, tile });
    },
    onHeight: link.setHeight,
  });

  // Shown once the text font has loaded (at most 1 s), so the text doesn't pop in after the icons.
  function ready() {
    return link.ready({ fonts: true });
  }

  // The events keep it current; this catches a missed one (a screen that slept) and retries a failed read.
  const refresh = wireRefresh(load);
  async function load() {
    const seq = ++loadSeq;
    loading = true;
    try {
      const state = await Homey.api('GET', `/state?board=${encodeURIComponent(board)}${link.perfParam()}`);
      if (seq !== loadSeq) return; // a newer load is on its way
      loading = false;
      widget.setState(state);
      loaded = true;
    } catch (err) {
      if (seq !== loadSeq) return;
      loading = false;
      console.error(err);
      refresh.failed();
      // A failed refresh keeps the tiles; only a failed first load replaces them with the error.
      widget.setMessage(widget.t('error'), loaded);
    }
    ready();
  }

  Homey.on('flowtiles:state', (entry) => {
    // A read under way may have left before this change, and its answer would undo it: read again.
    if (widget.pushBoard(entry, key) && loading) load();
  });

  // The time of a change (Show when it changed) moves on by itself: drawn again each minute.
  if (settings.showAge === true) {
    setInterval(() => widget.render(), 60e3);
    // Its times follow the app's time format: drawn again when it changes.
    wireTimeFormat(Homey, () => widget.render());
  }
  load();
};
/** The classes index.html puts on its body; the Smart Stack puts them on the slide. */
window.mountFlowTilesWidget.frameClass = 'homey-widget-full';
