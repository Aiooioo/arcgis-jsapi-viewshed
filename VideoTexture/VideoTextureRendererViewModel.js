define([
  "esri/chunks/vec3",
  "esri/chunks/vec3f64",
  "esri/chunks/vec4",
  "esri/chunks/vec4f64",
  "esri/chunks/mat3",
  "esri/chunks/mat3f64",
  "esri/chunks/mat4",
  "esri/chunks/mat4f64",
  "esri/core/Accessor",
  "esri/core/accessorSupport/trackingUtils",
  "esri/core/Evented",
  "esri/core/Logger",
  "esri/core/Handles",
  "esri/core/handleUtils",
  "esri/core/throttle",
  "esri/core/Collection",
  "esri/core/collectionUtils",
  "esri/core/maybe",
  "esri/core/reactiveUtils",
  "esri/core/watchUtils",
  "esri/core/promiseUtils",
  "esri/core/screenUtils",
  "esri/geometry/SpatialReference",
  "esri/geometry/Point",
  "esri/geometry/Polyline",
  "esri/geometry/Polygon",
  "esri/geometry/Mesh",
  "esri/Graphic",
  "esri/Camera",
  "esri/views/layers/support/FeatureFilter",
  "esri/layers/GraphicsLayer",
  "esri/layers/SceneLayer",
  "esri/layers/LineOfSightLayer",
  "esri/layers/LineOfSightTarget",
  "esri/widgets/support/traversalUtils",
  "esri/widgets/support/InteractiveToolViewModel",
  "esri/widgets/LineOfSight/LineOfSightViewModel",
  "esri/views/3d/webgl-engine/lib/Camera",
  "esri/views/3d/interactive/analysisTools/lineOfSight/LineOfSightTool",
  "esri/views/3d/externalRenderers",
  "esri/widgets/LineOfSight/LineOfSightTarget",
  "videotexture/VideoTextureRenderer",
  "videotexture/VideoTextureTechnique",
  "videotexture/support/videoTextureMathUtils",
], function (
  vec3,
  vec3f64,
  vec4,
  vec4f64,
  mat3,
  mat3f64,
  mat4,
  mat4f64,

  Accessor,
  trackingUtils,
  Evented,
  Logger,
  Handles,
  handleUtils,
  throttleUtils,
  Collection,
  collectionUtils,
  maybe,
  reactiveUtils,
  watchUtils,
  promiseUtils,
  screenUtils,

  SpatialReference,
  Point,
  Polyline,
  Polygon,
  Mesh,
  Graphic,
  Camera,
  FeatureFilter,
  GraphicsLayer,
  SceneLayer,
  LineOfSightLayer,
  LineOfSightLayerTarget,
  traversalUtils,
  InteractiveToolViewModel,
  LineOfSightViewModel,
  WebGLEngineCamera,
  LineOfSightTool,
  externalRenderers,
  LineOfSightTarget,
  Viewshed3DRenderer,
  Viewshed3DTechnique,
  viewshed3DMathUtils
) {
  var logger = Logger.getLogger(
    "geoscene.widgets.VideoTexture.RendererViewModel"
  );

  function v(q) {
    if (q.suspended) return !1;
    switch (q.type) {
      case "building-scene-3d":
      case "csv-3d":
      case "elevation-3d":
      case "feature-3d":
      case "geojson-3d":
      case "graphics-3d":
      case "integrated-mesh-3d":
      case "ogc-feature-3d":
      case "scene-layer-3d":
      case "scene-layer-graphics-3d":
      case "slice-3d":
      case "stream-3d":
      case "wms-3d":
        return !0;
      case "area-measurement-3d":
      case "base-dynamic-3d":
      case "direct-line-measurement-3d":
      case "imagery-3d":
      case "imagery-tile-3d":
      case "line-of-sight-3d":
      case "map-image-3d":
      case "point-cloud-3d":
      case "tile-3d":
      case "vector-tile-3d":
      case "voxel-3d":
      case "wfs-3d":
      case "wmts-3d":
      case "voxel-3d":
        return !1;
      case "group":
        return q.layerViews.toArray().some((r) => v(r));
      default:
        return !1;
    }
  }

  function rad2deg(rad) {
    return (rad * 180) / Math.PI;
  }

  return Evented.EventedMixin(Accessor).createSubclass({
    declaredClass: "geoscene.widgets.VideoTexture.RendererViewModel",

    properties: {
      observer: {},
      target: {},
      _renderView: {
        get() {
          var { view } = this;
          if (maybe.isNone(view)) return null;

          var _stage = view._stage;
          return maybe.isNone(_stage) ? null : _stage.renderView;
        },
      },
      _previewing: {
        get() {
          const { view } = this;
          return maybe.isNone(view) || maybe.isNone(view.allLayerViews)
            ? true
            : this._forcePreview ||
                !view.stationary ||
                view.allLayerViews.some((b) => v(b) && b.updating);
        },
      },
      ready: {},
      view: {},
    },

    constructor() {
      this.logger = logger;
      this.supportedViewType = "3d";
      this.unsupportedErrorMessage =
        "VideoTextureRendererViewModel is only supported in 3D views.";
      this.ready = false;
      this.view = null;
      this.handles = new Handles();
      this.tempLayer = new GraphicsLayer();

      this._running = true;
      this._forcePreview = true;
      this._stopPreviewingTask = null;
      this.customTechniqueAttached = false;
    },

    initialize() {
      this.handles.add([
        trackingUtils.autorun(() =>
          this._setViewshedParameters({ enabled: this._running })
        ),
        trackingUtils.autorun(() => {
          this._setViewshedParameters({ previewing: this._previewing });
        }),
        watchUtils.watch(this, "observer", () => {
          if (!!this.observer && !!this.target) {
            this.generateViewshedPlane();
          }
        }),
        watchUtils.watch(this, "target", () => {
          if (!!this.observer && !!this.target) {
            // if (this.autoGenerateTimer) {
            //   clearTimeout(this.autoGenerateTimer);
            //   this.autoGenerateTimer = null;
            // }
            // this.autoGenerateTimer = setTimeout(() => {
            // this.autoGenerateTimer = null;
            // }, 300);
          }
        }),
      ]);

      this.view.map.add(this.tempLayer);
    },

    destroy() {
      this.tempLayer.removeAll();
      this.view.map.remove(this.tempLayer);
    },

    _setViewshedParameters(a) {
      const _renderView = this._renderView;
      maybe.isNone(_renderView) ||
        _renderView.setRenderParameters({ shadowCastOptions: a });
    },

    _replaceAccumulatorTechnique(shadowMatrix) {
      const accumulator =
        this.view._stage.renderView._renderer._shadowAccumulator;

      this.preserveRender = accumulator._accumulationRenderer;
      this.preserveTechnique = accumulator._accumulationTechnique;

      const techConfig =
        new Viewshed3DTechnique.Viewshed3DTechniqueConfiguration();
      techConfig.pass = 0;

      const technique = new Viewshed3DTechnique.Viewshed3DTechnique(
        {
          rctx: this.preserveRender._rctx,
          viewingMode: accumulator._stage.viewingMode,
        },
        techConfig
      );
      accumulator._accumulationTechnique = technique;

      accumulator._accumulationRenderer =
        new Viewshed3DRenderer.ShadowCastRenderer(
          this.preserveRender._techniqueRep,
          this.preserveRender._rctx,
          this.preserveRender._shadowAccumulator,
          this.preserveRender._requestRender
        );

      accumulator._accumulationParams = {
        ...accumulator._accumulationParams,
        pointShadowMatrix: shadowMatrix,
      };
    },

    _updateShadowMapMatrices(target) {
      const accumulator =
        this.view._stage.renderView._renderer._shadowAccumulator;

      if (accumulator._accumulationRenderer.videoTexture) {
        this.previousVideoToken =
          accumulator._accumulationRenderer.videoTexture.frameUpdate(
            accumulator._accumulationRenderer._rctx,
            accumulator._accumulationRenderer._textureTechnique,
            this.previousVideoToken
          );
        accumulator._accumulationRenderer._rctx.resetState();
        externalRenderers.requestRender(this.view);
      }
      // const shadowMap = accumulator._shadowMap;

      // const targetVec = vec3f64.create();

      // this.view.renderCoordsHelper.toRenderCoords(target, targetVec);
      // window.viewshedTarget = targetVec;

      const that = this;
      this.videoTextureTimer = requestAnimationFrame(() => {
        that._updateShadowMapMatrices();
      });
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
              material: { color: "transparent" },
              edges: {
                type: "solid",
                color: "rgba(205,205,205,0.7)",
              },
            },
          ],
        },
      });

      this.tempLayer.add(conus);
    },

    async generateViewshedPlane() {
      // this.isFindGroundCenter = true;

      this.tempLayer.removeAll();

      // const prevCamera = this.view.camera.clone();
      // const prevCenter = this.view.center.clone();
      // const videoAspect = 16 / 9;
      // const videoFovX = Math.tan((Math.PI * 55) / 180);
      // const videoFovY = (Math.atan(videoFovX / videoAspect) * 180) / Math.PI;

      // this.view.camera = new Camera({
      //   position: this.observer,
      //   heading: viewshed3DMathUtils.getHeading(this.observer, this.target),
      //   tilt: viewshed3DMathUtils.getTilt(this.observer, this.target),
      // });
      // this.view.center = this.target;

      // const hitResult = await this.view.hitTest({
      //   x: window.innerWidth / 2,
      //   y: window.innerHeight / 2,
      // });

      // const ground = hitResult.ground.mapPoint;

      // const nextCamera = this.view.camera.clone();
      // nextCamera.tilt = nextCamera.tilt - videoFovY;

      // this.view.camera = nextCamera;

      // const hitResult2 = await this.view.hitTest({
      //   x: window.innerWidth / 2,
      //   y: window.innerHeight / 2,
      // });

      // const ground2 = hitResult2.ground.mapPoint;

      // this.view.camera = prevCamera;
      // this.view.center = prevCenter;

      // this.isFindGroundCenter = false;

      const plane = viewshed3DMathUtils.createViewPlane(
        this.observer,
        this.target
      );

      // change lighting direction
      window.observer1 = this.observer;
      window.target1 = this.target;
      window.externalRenderers1 = externalRenderers;
      const renderCoordinates = new Array(6);
      externalRenderers.toRenderCoordinates(
        this.view,
        [
          this.observer.x,
          this.observer.y,
          this.observer.z,

          this.target.x,
          this.target.y,
          this.target.z,

          // plane.extent.center.x,
          // plane.extent.center.y,
          // plane.extent.center.z,

          // ground.x,
          // ground.y,
          // ground.z,
          // ground2.x,
          // ground2.y,
          // ground2.z,
        ],
        0,
        null,
        renderCoordinates,
        0,
        2
      );

      // const transform = new Array(16);
      // const inverseTransform = mat4f64.create();
      // externalRenderers.renderCoordinateTransformAt(
      //   this.view,
      //   [this.observer.x, this.observer.y, this.observer.z],
      //   SpatialReference.WebMercator,
      //   transform
      // );
      // mat4.invert(inverseTransform, transform);
      const targetVec4 = vec4f64.fromValues(
        renderCoordinates[3] - renderCoordinates[0],
        renderCoordinates[4] - renderCoordinates[1],
        renderCoordinates[5] - renderCoordinates[2],
        0
      );
      // const targetLocalCoords = vec4f64.create();
      // vec4.transformMat4(targetLocalCoords, targetVec4, inverseTransform);
      // const targetLocalCoordsVec3 = vec3f64.fromValues(
      //   targetLocalCoords[0],
      //   targetLocalCoords[1],
      //   targetLocalCoords[2]
      // );
      // vec3.normalize(targetLocalCoordsVec3, targetLocalCoordsVec3);
      // const heading =
      //   Math.PI / 2 -
      //   Math.atan2(targetLocalCoordsVec3[1], targetLocalCoordsVec3[0]);
      // const pitch = 180 - rad2deg(Math.acos(targetLocalCoordsVec3[2]));

      const shadowMatrix = mat4f64.create();
      const upInRenderCoords = vec3f64.create();

      const planeRenderCoords = new Array(12);
      externalRenderers.toRenderCoordinates(
        this.view,
        plane.vertexAttributes.position,
        0,
        null,
        planeRenderCoords,
        0,
        4
      );

      const topCenterRenderCoord = [
        (planeRenderCoords[0] + planeRenderCoords[3]) / 2,
        (planeRenderCoords[1] + planeRenderCoords[4]) / 2,
        (planeRenderCoords[2] + planeRenderCoords[5]) / 2,
      ];
      const dirOb2TopCenter = vec3f64.fromValues(
        topCenterRenderCoord[0] - renderCoordinates[0],
        topCenterRenderCoord[1] - renderCoordinates[1],
        topCenterRenderCoord[2] - renderCoordinates[2]
      );
      const dirSightTargetVec3 = vec3f64.fromValues(
        targetVec4[0],
        targetVec4[1],
        targetVec4[2]
      );
      const dirShadowCameraRight = vec3f64.create();
      vec3.cross(dirShadowCameraRight, dirSightTargetVec3, dirOb2TopCenter);
      vec3.cross(upInRenderCoords, dirShadowCameraRight, dirSightTargetVec3);

      const shadowCamera = new WebGLEngineCamera(
        [renderCoordinates[0], renderCoordinates[1], renderCoordinates[2]],
        [renderCoordinates[3], renderCoordinates[4], renderCoordinates[5]],
        upInRenderCoords
      );
      shadowCamera.near = 0.01;
      shadowCamera.far = vec3.distance(
        [renderCoordinates[0], renderCoordinates[1], renderCoordinates[2]],
        [renderCoordinates[3], renderCoordinates[4], renderCoordinates[5]]
      );
      shadowCamera.width = 100;
      shadowCamera.height = 100;

      window.shadowCamera1 = shadowCamera;

      const sceneCamera = this.view.state.camera;
      const shadowProjectionMatrix = shadowCamera.projectionMatrix;
      const shadowViewMatrix = shadowCamera.viewMatrix;
      const shadowCameraVPMatrix = mat4f64.create();
      mat4.multiply(
        shadowCameraVPMatrix,
        shadowProjectionMatrix,
        shadowViewMatrix
      );
      // mat4.translate(
      //   shadowCameraVPMatrix,
      //   shadowCameraVPMatrix,
      //   sceneCamera.center
      // );

      const lightingDir = vec3f64.fromValues(
        renderCoordinates[0] - renderCoordinates[3],
        renderCoordinates[1] - renderCoordinates[4],
        renderCoordinates[2] - renderCoordinates[5]
      );
      vec3.normalize(lightingDir, lightingDir);

      this.view._stage.renderView._renderer._lighting._mainLight.direction =
        lightingDir;

      const viewH = this.view.height;
      const viewW = this.view.width;

      // this.drawConus(this.observer, plane);

      const lightDirections = viewshed3DMathUtils.calculateSightDirections(
        this.view,
        this.observer,
        plane
      );

      const orderedIndex = [];
      traversalUtils.breadthFirstBinaryPartitioning(0, 256, orderedIndex);
      const ordered = Array(256);
      for (let i = 0; i < 256; i++) {
        ordered[i] = lightDirections[orderedIndex[i]];
      }

      // const renderCoordinates = new Array(12);
      // externalRenderers.toRenderCoordinates(
      //   this.view,
      //   [
      //     this.observer.x,
      //     this.observer.y,
      //     this.observer.z,
      //     plane.extent.center.x,
      //     plane.extent.center.y,
      //     plane.extent.center.z,
      //     ground.x,
      //     ground.y,
      //     ground.z,
      //     ground2.x,
      //     ground2.y,
      //     ground2.z,
      //   ],
      //   0,
      //   null,
      //   renderCoordinates,
      //   0,
      //   4
      // );

      // const glCamera = view._stage.state.camera;
      // const renderOriginOnScreen = glCamera.projectToRenderScreen(
      //   [renderCoordinates[0], renderCoordinates[1], renderCoordinates[2]],
      //   new Array(3)
      // );
      // const renderTargetOnScreen = glCamera.projectToRenderScreen(
      //   [renderCoordinates[3], renderCoordinates[4], renderCoordinates[5]],
      //   new Array(3)
      // );

      if (!this.customTechniqueAttached) {
        this._replaceAccumulatorTechnique(shadowMatrix);

        this.customTechniqueAttached = true;
      }

      this._setViewshedParameters({
        enabled: true,
        visualization: 0,
        color: [1, 0, 0, 0.7],
        // threshold: 0.26,
        bandsEnabled: false,
        bandSize: 0,
        lightDirections: ordered,
        pointShadowMatrix: shadowCameraVPMatrix,
        // groundCenter: groundCenterRenderCoord,
        // groundCenter2: groundCenter2RenderCoord,
        observerRaw: this.observer,
        targetRaw: this.target,
        observer: [
          renderCoordinates[0],
          renderCoordinates[1],
          renderCoordinates[2],
        ],
        sightTarget: [
          renderCoordinates[3],
          renderCoordinates[4],
          renderCoordinates[5],
        ],
      });

      if (this.videoTextureTimer) {
        cancelAnimationFrame(this.videoTextureTimer);
      }
      const that = this;
      this.videoTextureTimer = requestAnimationFrame(() => {
        that._updateShadowMapMatrices();
      });
    },
  });
});
