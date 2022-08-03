define([
  "esri/chunks/vec3",
  "esri/chunks/vec3f64",
  "esri/chunks/mat3",
  "esri/chunks/mat3f64",
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
  "esri/geometry/Point",
  "esri/geometry/Polyline",
  "esri/geometry/Mesh",
  "esri/Graphic",
  "esri/layers/GraphicsLayer",
  "esri/layers/LineOfSightLayer",
  "esri/layers/LineOfSightTarget",
  "esri/widgets/support/InteractiveToolViewModel",
  "esri/widgets/LineOfSight/LineOfSightViewModel",
  "esri/views/3d/interactive/analysisTools/lineOfSight/LineOfSightTool",
  "esri/widgets/LineOfSight/LineOfSightTarget",
], function (
  vec3,
  vec3f64,
  mat3,
  mat3f64,
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
  Point,
  Polyline,
  Mesh,
  Graphic,
  GraphicsLayer,
  LineOfSightLayer,
  LineOfSightLayerTarget,
  InteractiveToolViewModel,
  LineOfSightViewModel,
  LineOfSightTool,
  LineOfSightTarget
) {
  var logger = Logger.getLogger("geoscene.widgets.SimpleViewshed3DViewModel");
  var Targets = Collection.ofType(LineOfSightTarget);

  function rad2deg(rad) {
    return (rad * 180) / Math.PI;
  }

  function range(num) {
    const ret = [];

    let i = 0;
    while (i < num) {
      ret.push(i);
      i++;
    }

    return ret;
  }

  return Evented.EventedMixin(
    InteractiveToolViewModel.InteractiveToolViewModel
  ).createSubclass({
    declaredClass: "geoscene.widgets.SimpleViewshed3DViewModel",

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
        "SimpleViewshed3DViewModel is only supported in 3D views.";
      this.ready = false;
      this.view = null;
      this.handles = new Handles();
      this._vmTargetsToConnection = new Map();
      this._layerTargetsToConnection = new Map();
      this.layerView = null;
      this.observer = null;
      this.model = new LineOfSightLayer({ listMode: "hide" });
      this.densifyMaxSegLen = 10;
      this.densifyVMaxSegLen = 10;
      this.actualDensifyRows = -1;
      this.actualDensifyRowSamples = -1;
      this.runningViewshed = false;
      this.needDrawViewshed = true;
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
                  const g = this._layerTargetsToConnection.get(k.target);
                  if (g) {
                    if (this._layerTargetsToConnection.size === 1) {
                      if (
                        k.target.location.equals(g.viewModelTarget.location) &&
                        !this.needDrawViewshed
                      ) {
                        return;
                      } else {
                        this.needDrawViewshed = true;
                      }
                    }

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

                    if (!this.runningViewshed && this.needDrawViewshed) {
                      this.redrawViewshed(that.model.observer, k.result.target);
                    }
                  }
                }),
              ],
              "view"
            );
          }
        });
      }
    },

    _disconnectFromView() {
      this.ready = false;
      if (null != this.view) {
        this.view.map.remove(this.model);
        this.handles.remove("view");
        this.layerView = null;
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

    redrawViewshed(origin, target) {
      var viewshed = Mesh.createPlane(target.location, {
        size: 300,
        unit: "meters",
        material: {
          color: "rgba(255,0,0,0.7)",
        },
      });
      for (let i = 2; i < viewshed.vertexAttributes.position.length; i += 3) {
        viewshed.vertexAttributes.position[i] = target.location.z;
      }

      var up = vec3f64.fromArray([0, 0, 1]);
      var dir = vec3f64.fromArray([
        target.location.x - origin.x,
        target.location.y - origin.y,
        target.location.z - origin.z,
      ]);
      var a = vec3f64.create();
      var b = vec3f64.create();
      vec3.normalize(a, up);
      vec3.normalize(b, dir);

      var v = vec3f64.create();
      vec3.cross(v, a, b);
      var c = vec3.dot(a, b);

      var vx = mat3f64.fromValues(
        0,
        v[2],
        -v[1],
        -v[2],
        0,
        v[0],
        v[1],
        -v[0],
        0
      );

      var I = mat3f64.fromValues(1, 0, 0, 0, 1, 0, 0, 0, 1);
      var R = mat3f64.create();
      var r2 = mat3f64.create();

      mat3.add(R, I, vx);
      mat3.multiply(r2, vx, vx);
      mat3.multiplyScalar(r2, r2, 1 / (1 + c));
      mat3.add(R, R, r2);

      let theta, phi, chi;
      var sy = Math.sqrt(R[0] * R[0] + R[1] * R[1]);
      var singular = sy < 1e-6;
      if (!singular) {
        theta = Math.atan2(R[5], R[8]);
        chi = Math.atan2(-R[2], sy);
        phi = Math.atan2(R[1], R[0]);
      } else {
        phi = 0;
        theta = Math.atan2(-R[7], R[4]);
        chi = Math.atan2(-R[2], sy);
      }

      theta = rad2deg(theta);
      chi = rad2deg(chi);
      phi = rad2deg(phi);

      viewshed.rotate(theta, chi, phi);

      this.emit("viewshed-change", {
        origin: origin,
        geometry: viewshed,
      });

      this.needDrawViewshed = false;

      this.startViewshedTask(origin, viewshed);
    },

    drawConus(origin, viewshed) {
      var conus = new Graphic({
        geometry: new Mesh({
          vertexAttributes: {
            position: [
              origin.x,
              origin.y,
              origin.z,
              ...viewshed.vertexAttributes.position,
            ],
          },
          components: [
            {
              faces: [0, 2, 1, 0, 2, 3, 0, 3, 4, 0, 4, 1],
              material: {
                color: "rgba(211,211,211, 0.5)",
              },
            },
          ],
          spatialReference: {
            wkid: 102100,
            latestWkid: 3857,
          },
        }),
        symbol: {
          type: "mesh-3d",
          symbolLayers: [
            {
              type: "fill",
              edges: {
                type: "solid",
                color: "rgba(205,205,205,0.7)",
              },
            },
          ],
        },
      });

      this.emit("conus-change", {
        graphic: conus,
      });
    },

    startViewshedTask(origin, viewshed) {
      const vertex = viewshed.vertexAttributes.position;
      const diffH = [
        vertex[3] - vertex[0],
        vertex[4] - vertex[1],
        vertex[5] - vertex[2],
      ];
      const diffV = [
        vertex[6] - vertex[3],
        vertex[7] - vertex[4],
        vertex[8] - vertex[5],
      ];

      const calculateHVert = range(this.densifyMaxSegLen).map((index) => {
        const seg = (index + 1) / (this.densifyMaxSegLen + 1);
        return [
          vertex[0] + diffH[0] * seg,
          vertex[1] + diffH[1] * seg,
          vertex[2] + diffH[2] * seg,
        ];
      });
      const detailedHLine = new Polyline({
        paths: [
          [
            [vertex[0], vertex[1], vertex[2]],
            ...calculateHVert,
            [vertex[3], vertex[4], vertex[5]],
          ],
        ],
        spatialReference: { wkid: 102100, latestWkid: 3857 },
      });
      const calculateVVert = range(this.densifyVMaxSegLen).map((index) => {
        const seg = (index + 1) / (this.densifyVMaxSegLen + 1);
        return [
          vertex[3] + diffV[0] * seg,
          vertex[4] + diffV[1] * seg,
          vertex[5] + diffV[2] * seg,
        ];
      });
      const detailedVLine = new Polyline({
        paths: [
          [
            [vertex[3], vertex[4], vertex[5]],
            ...calculateVVert,
            [vertex[6], vertex[7], vertex[8]],
          ],
        ],
        spatialReference: { wkid: 102100, latestWkid: 3857 },
      });

      const targets = [];
      this.actualDensifyRows = detailedVLine.paths[0].length;
      this.actualDensifyRowSamples = detailedHLine.paths[0].length;

      for (let i = 0; i < this.actualDensifyRowSamples; i += 1) {
        const h = new Point({
          x: detailedHLine.paths[0][i][0],
          y: detailedHLine.paths[0][i][1],
          z: detailedHLine.paths[0][i][2],
          spatialReference: { wkid: 102100, latestWkid: 3857 },
        });
        const row = [h];

        for (let j = 0; j < this.actualDensifyRows - 1; j += 1) {
          const translate = [
            detailedVLine.paths[0][j + 1][0] - detailedVLine.paths[0][0][0],
            detailedVLine.paths[0][j + 1][1] - detailedVLine.paths[0][0][1],
            detailedVLine.paths[0][j + 1][2] - detailedVLine.paths[0][0][2],
          ];

          const v = new Point({
            x: h.x + translate[0],
            y: h.y + translate[1],
            z: h.z + translate[2],
            spatialReference: { wkid: 102100, latestWkid: 3857 },
          });

          row.push(v);
        }

        targets.push(row);
      }

      this.runViewshedTask(origin, viewshed, targets);
    },

    runViewshedTask(origin, viewshed, targets) {
      this.runningViewshed = true;
      this.results = [];

      this._task = new Promise(async (resolve) => {
        const flattern = targets.flat();
        let handles = [];

        const models = flattern.map((t) => {
          const model = new LineOfSightTarget({
            location: t,
          });

          return model;
        });

        handles.push(
          this.targets.on("change", (event) => {
            event.added.forEach((m) => {
              handles.push(
                m.watch("intersectedLocation", () => {
                  this.results = [];

                  models.forEach((los) => {
                    if (los.intersectedLocation) {
                      this.results.push(los.intersectedLocation.clone());
                    }
                  });
                })
              );
            });
          })
        );

        this.targets.addMany(models);
        watchUtils.whenEqualOnce(this.tool, "creating", () => this.stop());

        await promiseUtils.create(async (r) => {
          await new Promise((wait) => setTimeout(wait, 3000));

          handles.forEach((h) => h.remove());
          handles = null;

          this.targets.removeMany(models);

          r();
        });

        resolve();
      });

      this._task.then(() => {
        this.runningViewshed = false;

        this.drawConus(origin, viewshed);

        this.emit("result-change", {
          results: this.results,
        });
      });
    },
  });
});
