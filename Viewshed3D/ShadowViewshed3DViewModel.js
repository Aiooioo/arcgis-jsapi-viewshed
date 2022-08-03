define([
  "esri/core/Evented",
  "esri/core/Logger",
  "esri/core/Handles",
  "esri/core/handleUtils",
  "esri/core/Collection",
  "esri/core/collectionUtils",
  "esri/core/maybe",
  "esri/core/reactiveUtils",
  "esri/core/watchUtils",

  "esri/analysis/LineOfSightAnalysis",
  "esri/analysis/LineOfSightAnalysisTarget",
  "esri/analysis/LineOfSightAnalysisObserver",
  "esri/widgets/support/InteractiveAnalysisViewModel",

  "esri/views/3d/interactive/analysisTools/lineOfSight/LineOfSightTool",
  "esri/widgets/LineOfSight/LineOfSightTarget",
], function (
  Evented,
  Logger,
  Handles,
  handleUtils,
  Collection,
  collectionUtils,
  maybe,
  reactiveUtils,
  watchUtils,

  LineOfSightLayer,
  LineOfSightLayerTarget,
  LineOfSightLayerObserver,
  InteractiveAnalysisViewModel,

  LineOfSightTool,
  LineOfSightTarget
) {
  var logger = Logger.getLogger("geoscene.widgets.ShadowViewshed3DViewModel");
  var Targets = Collection.ofType(LineOfSightTarget);

  return Evented.EventedMixin(
    InteractiveAnalysisViewModel.InteractiveAnalysisViewModel
  ).createSubclass({
    declaredClass: "geoscene.widgets.SimpleViewshed3DViewModel",

    properties: {
      state: {
        readOnly: true,
        get() {
          return this.disabled || !this.ready
            ? "disabled"
            : maybe.isNone(this.tool) || "pending" === this.tool.toolState
            ? "ready"
            : this.tool.state;
        },
      },
      analysis: {
        type: LineOfSightLayer,
      },
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
      analysisView: {},
      observer: {
        get() {
          return maybe.isSome(this.analysis.observer)
            ? this.analysis.observer.position
            : null;
        },
        set(e) {
          this.analysis.observer = new LineOfSightLayerObserver({
            position: e,
          });
        },
      },
      targets: {
        type: Targets,
        cast: collectionUtils.castForReferenceSetter,
        nonNullable: !0,
        get() {
          return this._get("targets") || new Targets();
        },
        set(e) {
          this._set(
            "targets",
            collectionUtils.referenceSetter(e, this.targets, Targets)
          );
        },
      },
    },

    constructor() {
      this.logger = logger;
      this.supportedViewType = "3d";
      this.unsupportedErrorMessage =
        "SimpleViewshed3DViewModel is only supported in 3D views.";
      this.ready = false;
      this.view = null;
      this.handles = new Handles();
      this._vmTargetsToConnection = new Map();
      this._analysisTargetsToConnection = new Map();
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

        // this.model.targets.on("after-add", (a) =>
        //   this._onLayerTargetAdded(a.item)
        // ),
        // this.model.targets.on("after-remove", (a) =>
        //   this._onLayerTargetRemoved(a.item)
        // ),
        reactiveUtils.watch(
          () => this.analysis,
          (e) => this._onAnalysisChange(e),
          reactiveUtils.syncAndInitial
        ),
      ]);
    },

    destroy() {
      this._analysisTargetsToConnection.forEach((a) => a.remove());
      this.handles = maybe.destroyMaybe(this.handles);
    },

    stop() {
      maybe.isSome(this.tool) && this.tool.stop();
    },

    clear() {
      this.removeTool();
      this.observer = null;
      this.targets.removeAll();
    },

    continue() {
      if (maybe.isSome(this.tool)) {
        this.tool.continue();
      }
    },

    constructAnalysis() {
      return new LineOfSightLayer();
    },

    constructTool() {
      return new LineOfSightTool.LineOfSightTool({
        view: maybe.unwrap(this.view),
        analysis: this.analysis,
        analysisView: maybe.unwrap(this.analysisView),
        visible: this.visible,
      });
    },

    async onConnectToAnalysisView(analysisView) {
      if (!this.destroyed) {
        this.analysisView = analysisView;
        this.ready = true;
        this.handles.add(
          [
            this.analysisView.on("result-changed", (k) => {
              const g = this._analysisTargetsToConnection.get(k.target);
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
                  observer: this.analysis.observer.position,
                  target: k.target.position,
                });
              }
            }),
          ],
          "view"
        );
      }
    },

    onDisconnectFromAnalysisView() {
      this.ready = false;
      null !== this.handles && this.handles.remove("view");
      this.analysisView = null;
    },

    _onViewModelTargetAdded(item) {
      if (!this._vmTargetsToConnection.get(item)) {
        var t = new LineOfSightLayerTarget({
          location: item.location,
        });
        this._connectViewModelWithLayerTarget(item, t);
        this.analysis.targets.add(t);
      }
    },

    _onViewModelTargetRemoved(item) {
      const a = this._vmTargetsToConnection.get(item);
      if (a) {
        a.remove();
        this.analysis.targets.remove(a.analysisTarget);
      }
    },

    _onAnalysisTargetAdded(a) {
      if (!this._analysisTargetsToConnection.get(a)) {
        var b = new LineOfSightTarget({
          location: maybe.applySome(a.location, (f) => f.clone()),
        });
        this._connectViewModelWithLayerTarget(b, a);
        this.targets.add(b);
      }
    },

    _onAnalysisTargetRemoved(item) {
      const a = this._analysisTargetsToConnection.get(item);
      if (a) {
        a.remove();
        this.targets.remove(a.viewModelTarget);
      }
    },

    _connectViewModelWithLayerTarget(item, target) {
      let f = !1;
      const obs = handleUtils.handlesGroup([
        reactiveUtils.watch(
          () => target.position,
          (r) => {
            f ||
              ((f = !0),
              (item.location = maybe.applySome(r, (t) => t.clone())),
              (f = !1));
          },
          reactiveUtils.sync
        ),
        reactiveUtils.watch(
          () => item.location,
          (r) => {
            f ||
              ((f = !0),
              (target.position = maybe.applySome(r, (t) => t.clone())),
              (f = !1));
          },
          reactiveUtils.sync
        ),
      ]);
      const t = {
        analysisTarget: target,
        viewModelTarget: item,
        remove: () => {
          obs.remove();
          this._vmTargetsToConnection.delete(item);
          this._analysisTargetsToConnection.delete(target);
        },
      };
      this._vmTargetsToConnection.set(item, t);
      this._analysisTargetsToConnection.set(target, t);
    },

    _onAnalysisChange(e) {
      const t = "analysis";
      this.handles.remove(t);
      this.handles.add(
        [
          this.analysis.targets.on("after-add", (e) =>
            this._onAnalysisTargetAdded(e.item)
          ),
          this.analysis.targets.on("after-remove", (e) =>
            this._onAnalysisTargetRemoved(e.item)
          ),
        ],
        t
      );
      this.targets.removeAll();
      e.targets.forEach((e) => {
        this._onAnalysisTargetAdded(e);
      });
    },
  });
});
