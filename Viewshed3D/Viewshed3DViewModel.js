define([
  "esri/core/Accessor",
  "esri/core/Logger",
  "esri/core/Handles",
  "esri/core/reactiveUtils",
  "esri/core/watchUtils",
  "esri/core/maybe",
  "esri/core/accessorSupport/trackingUtils",
  "esri/Graphic",
  "esri/layers/GraphicsLayer",
  "viewshed/ShadowViewshed3DViewModel",
  "viewshed/Viewshed3DRendererViewModel",
], function (
  Accessor,
  Logger,
  Handles,
  reactiveUtils,
  watchUtils,
  maybe,
  trackingUtils,
  Graphic,
  GraphicsLayer,
  ShadowViewshed3DViewModel,
  Viewshed3DRendererViewModel
) {
  var logger = Logger.getLogger("geoscene.widgets.Viewshed3DViewModel");

  return Accessor.createSubclass({
    declaredClass: "geoscene.widgets.Viewshed3DViewModel",

    properties: {
      sightObserver: {},
      sightTarget: {},
      ready: {},
      view: {},
    },

    constructor() {
      this.logger = logger;
      this.interactionVM = null;
      this.rendererVM = null;
      this.ready = false;
      this.view = null;
      this.handles = new Handles();
      this.viewshedLayer = new GraphicsLayer({
        listMode: "hide",
        elevationInfo: {
          mode: "absolute-height",
        },
      });
    },

    initialize() {
      this.handles.add([
        reactiveUtils.watch(
          () => ({
            view: this.view,
            ready: maybe.isSome(this.view) && this.view.ready,
          }),
          ({ view: a }) => {
            this._disconnectFromView();
            this._connectToView(a);
          },
          { sync: !0 }
        ),
        watchUtils.watch(this, ["sightObserver", "sightTarget"], () => {
          if (this.rendererVM) {
            this.rendererVM.sightObserver = this.sightObserver;
            this.rendererVM.sightTarget = this.sightTarget;

            if (this.rendererVM.sightObserver && this.rendererVM.sightTarget) {
              if (!this.rendererVM._running) {
                this.rendererVM._running = true;
              }
            }
          }
        }),
      ]);
      this._connectToView(this.view);
    },

    _connectToView(v) {
      if (!maybe.isNone(v) && v.ready) {
        v.map.layers.add(this.viewshedLayer);
      }

      if (v.type === "3d") {
        const that = this;

        v.whenLayerView(this.viewshedLayer).then((layerView) => {
          that.layerView = layerView;

          if (!(this.destroyed || v !== that.view)) {
            that.ready = true;
          }
        });
      }
    },

    _disconnectFromView() {
      this.ready = false;
      if (null != this.view) {
        this.view.map.remove(this.viewshedLayer);
        this.handles.remove("view");
        this.layerView = null;
      }
    },

    ensureInteraction() {
      if (!this.interactionVM) {
        this.interactionVM = new ShadowViewshed3DViewModel({
          view: this.view,
        });

        this.handles.add(
          [
            this.interactionVM.on(
              "observer-target-change",
              ({ observer, target }) => {
                this.sightObserver = observer;
                this.sightTarget = target;
              }
            ),
          ],
          "view"
        );
      }
    },

    ensureRenderer() {
      if (!this.rendererVM) {
        this.rendererVM = new Viewshed3DRendererViewModel({
          view: this.view,
        });
      }
    },

    destroyImpl() {
      this.handles.remove("view");
      if (this.interactionVM) {
        this.interactionVM.destroy();
        this.interactionVM = null;
      }

      if (this.rendererVM) {
        this.rendererVM.destroy();

        this.rendererVM = null;
      }
    },

    start() {
      const that = this;
      watchUtils.whenTrueOnce(this, "ready").then(() => {
        that.viewshedLayer.removeAll();

        that.ensureInteraction();
        that.ensureRenderer();

        that.interactionVM.start();
      });
    },

    stop() {
      this.handles.remove("view");
    },

    clear() {
      if (this.interactionVM) {
        this.interactionVM.clear();
      }

      this.sightObserver = null;
      this.sightTarget = null;

      if (this.rendererVM) {
        this.rendererVM._running = false;
      }
    },
  });
});
