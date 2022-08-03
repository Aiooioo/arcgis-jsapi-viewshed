define([
    "esri/chunks/vec3",
    "esri/chunks/vec3f64",
    "esri/chunks/vec4f64",
    "esri/chunks/mat3",
    "esri/chunks/mat3f64",
    "esri/core/accessorSupport/trackingUtils",
    "esri/core/Evented",
    "esri/core/Logger",
    "esri/core/Handles",
    "esri/core/handleUtils",
    "esri/core/Collection",
    "esri/core/collectionUtils",
    "esri/core/maybe",
    "esri/core/reactiveUtils",
    "esri/core/watchUtils",
    "esri/core/promiseUtils",
    "esri/core/screenUtils",
    "esri/geometry/Point",
    "esri/geometry/Polyline",
    "esri/geometry/Polygon",
    "esri/geometry/Mesh",
    "esri/Graphic",
    "esri/views/layers/support/FeatureFilter",
    "esri/layers/GraphicsLayer",
    "esri/layers/SceneLayer",
    "esri/layers/LineOfSightLayer",
    "esri/layers/LineOfSightTarget",
    "esri/widgets/support/traversalUtils",
    "esri/widgets/support/InteractiveToolViewModel",
    "esri/widgets/LineOfSight/LineOfSightViewModel",
    "esri/views/3d/interactive/analysisTools/lineOfSight/LineOfSightTool",
    "esri/views/3d/externalRenderers",
    "esri/widgets/LineOfSight/LineOfSightTarget",
    "videotexture/VideoTextureRenderer",
    "videotexture/VideoTextureTechnique",
  ], function (
    vec3,
    vec3f64,
    vec4f64,
    mat3,
    mat3f64,
    trackingUtils,
    Evented,
    Logger,
    Handles,
    handleUtils,
    Collection,
    collectionUtils,
    maybe,
    reactiveUtils,
    watchUtils,
    promiseUtils,
    screenUtils,
    Point,
    Polyline,
    Polygon,
    Mesh,
    Graphic,
    FeatureFilter,
    GraphicsLayer,
    SceneLayer,
    LineOfSightLayer,
    LineOfSightLayerTarget,
    traversalUtils,
    InteractiveToolViewModel,
    LineOfSightViewModel,
    LineOfSightTool,
    externalRenderers,
    LineOfSightTarget,
    Viewshed3DRenderer,
    Viewshed3DTechnique
  ) {
    var logger = Logger.getLogger("geoscene.widgets.ShadowVideoTextureViewModel");
    var Targets = Collection.ofType(LineOfSightTarget);
  
    return Evented.EventedMixin(
      InteractiveToolViewModel.InteractiveToolViewModel
    ).createSubclass({
      declaredClass: "geoscene.widgets.ShadowVideoTextureViewModel",
  
      properties: {
        targets: {
          get() {
            return this._get("targets") || new Targets();
          },
          set(a) {
            this._set(
              "targets",
              collectionUtils.referenceSetter(a, this.targets, Targets)
            );
          },
        },
        ready: {},
        view: {},
      },
  
      constructor() {
        this.logger = logger;
        this.supportedViewType = "3d";
        this.unsupportedErrorMessage =
          "ShadowVideoTextureViewModel is only supported in 3D views.";
        this.ready = false;
        this.view = null;
        this.handles = new Handles();
        this._vmTargetsToConnection = new Map();
        this._layerTargetsToConnection = new Map();
        this.layerView = null;
        this.observer = null;
        this.model = new LineOfSightLayer({ listMode: "hide" });
      },
  
      initialize() {
        this.handles.add([
          this.targets.on("after-add", (a) =>
            this._onViewModelTargetAdded(a.item)
          ),
          this.targets.on("after-remove", (a) =>
            this._onViewModelTargetRemoved(a.item)
          ),
          this.model.targets.on("after-add", (a) =>
            this._onLayerTargetAdded(a.item)
          ),
          this.model.targets.on("after-remove", (a) =>
            this._onLayerTargetRemoved(a.item)
          ),
          reactiveUtils.react(
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
        ]);
        this._connectToView(this.view);
      },
  
      destroy() {
        this._disconnectFromView();
        this._layerTargetsToConnection.forEach((a) => a.remove());
        this.model = maybe.destroyMaybe(this.model);
        this.handles = maybe.destroyMaybe(this.handles);
      },
  
      start() {
        const that = this;
        watchUtils.whenTrueOnce(this, "ready").then(() => {
          that.createTool();
        });
      },
  
      stop() {
        maybe.isSome(this.tool) && this.tool.stop();
      },
  
      clear() {
        this.removeTool();
        this.observer = null;
        this.targets.removeAll();
      },
  
      createToolParams() {
        return {
          toolConstructor: LineOfSightTool.LineOfSightTool,
          constructorArguments: () => ({ model: this.model }),
        };
      },
  
      _disconnectFromView() {
        this.ready = false;
        if (null != this.view) {
          this.view.map.remove(this.model);
          this.handles.remove("view");
          this.layerView = null;
        }
      },
  
      _connectToView(v) {
        if (!maybe.isNone(v) && v.ready) {
          v.map.layers.add(this.model);
        }
  
        if (v.type === "3d") {
          const that = this;
          v.whenLayerView(this.model).then((layerView) => {
            if (!(this.destroyed || v !== that.view)) {
              that.layerView = layerView;
              that.ready = true;
  
              that.handles.add(
                [
                  that.layerView.on("result-changed", (k) => {
                    if (this.active) {
                      this.stop();
                    }
  
                    const g = this._layerTargetsToConnection.get(k.target);
                    if (g) {
                      if (maybe.isSome(k.result)) {
                        g.viewModelTarget.intersectedGraphic =
                          k.result.intersectedGraphic;
                        g.viewModelTarget.intersectedLocation = maybe.unwrap(
                          k.result.intersectedLocation
                        );
                        g.viewModelTarget.visible = k.result.visible;
                      } else {
                        g.viewModelTarget.intersectedGraphic = null;
                        g.viewModelTarget.intersectedLocation = null;
                        g.viewModelTarget.visible = void 0;
                      }
  
                      // notify points
                      this.emit("observer-target-change", {
                        observer: this.model.observer,
                        target: k.target.location,
                      });
                    }
                  }),
                ],
                "view"
              );
            }
          });
        }
      },
  
      _onViewModelTargetAdded(item) {
        if (!this._vmTargetsToConnection.get(item)) {
          var t = new LineOfSightLayerTarget.LineOfSightTarget({
            location: item.location,
          });
          this._connectViewModelWithLayerTarget(item, t);
          this.model.targets.add(t);
        }
      },
  
      _onViewModelTargetRemoved(item) {
        const a = this._vmTargetsToConnection.get(item);
        if (a) {
          a.remove();
          this.model.targets.remove(a.layerTarget);
        }
      },
  
      _onLayerTargetAdded(a) {
        if (!this._layerTargetsToConnection.get(a)) {
          var b = new LineOfSightTarget({
            location: maybe.applySome(a.location, (f) => f.clone()),
          });
          this._connectViewModelWithLayerTarget(b, a);
          this.targets.add(b);
        }
      },
  
      _onLayerTargetRemoved(item) {
        const a = this._layerTargetsToConnection.get(item);
        if (a) {
          a.remove();
          this.targets.remove(a.viewModelTarget);
        }
      },
  
      _connectViewModelWithLayerTarget(item, target) {
        let f = !1;
        const obs = handleUtils.handlesGroup([
          reactiveUtils.react(
            () => target.location,
            (r) => {
              f ||
                ((f = !0),
                (item.location = maybe.applySome(r, (t) => t.clone())),
                (f = !1));
            },
            { sync: !0 }
          ),
          reactiveUtils.react(
            () => item.location,
            (r) => {
              f ||
                ((f = !0),
                (target.location = maybe.applySome(r, (t) => t.clone())),
                (f = !1));
            },
            { sync: !0 }
          ),
        ]);
        const t = {
          layerTarget: target,
          viewModelTarget: item,
          remove: () => {
            obs.remove();
            this._vmTargetsToConnection.delete(item);
            this._layerTargetsToConnection.delete(target);
          },
        };
        this._vmTargetsToConnection.set(item, t);
        this._layerTargetsToConnection.set(target, t);
      },
    });
  });
  