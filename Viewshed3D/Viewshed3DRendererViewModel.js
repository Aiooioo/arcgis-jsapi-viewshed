define([
  "esri/chunks/vec3",
  "esri/chunks/vec3f64",
  "esri/chunks/vec4",
  "esri/chunks/vec4f64",
  "esri/chunks/mat4",
  "esri/chunks/mat4f64",
  "esri/core/Accessor",
  "esri/core/Evented",
  "esri/core/Logger",
  "esri/core/Handles",
  "esri/core/maybe",
  "esri/core/reactiveUtils",

  "esri/widgets/support/traversalUtils",

  "esri/views/3d/externalRenderers",
  "viewshed/Viewshed3DRenderer",
  "viewshed/Viewshed3DTechnique",
  "viewshed/support/viewshed3DMathUtils",
], function (
  vec3,
  vec3f64,
  vec4,
  vec4f64,
  mat4,
  mat4f64,
  Accessor,
  Evented,
  Logger,
  Handles,
  maybe,
  reactiveUtils,

  traversalUtils,

  externalRenderers,

  Viewshed3DRenderer,
  Viewshed3DTechnique,
  viewshed3DMathUtils
) {
  var logger = Logger.getLogger(
    "geoscene.widgets.Viewshed3D.RendererViewModel"
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

  return Evented.EventedMixin(Accessor).createSubclass({
    declaredClass: "geoscene.widgets.Viewshed3D.RendererViewModel",

    properties: {
      sightObserver: {},
      sightTarget: {},
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
      _running: {},
    },

    constructor() {
      this.logger = logger;
      this.supportedViewType = "3d";
      this.unsupportedErrorMessage =
        "Viewshed3DRendererViewModel is only supported in 3D views.";
      this.ready = false;
      this.view = null;
      this.handles = new Handles();

      this._running = true;
      this._forcePreview = false;
      this._stopPreviewingTask = null;
      this.customTechniqueAttached = false;
    },

    initialize() {
      this.handles.add([
        reactiveUtils.watch(
          () => ({
            renderView: this._renderView,
            parameters: { enabled: this._running },
          }),
          ({ renderView, parameters }) => {
            if (maybe.isSome(renderView) && maybe.isSome(parameters)) {
              renderView.setRenderParameters({ shadowCastOptions: parameters });
            }
          },
          reactiveUtils.syncAndInitial
        ),
        reactiveUtils.watch(
          () => ({
            renderView: this._renderView,
            parameters: { previewing: this._previewing },
          }),
          ({ renderView, parameters }) => {
            if (maybe.isSome(renderView) && maybe.isSome(parameters)) {
              renderView.setRenderParameters({ shadowCastOptions: parameters });
            }
          },
          reactiveUtils.syncAndInitial
        ),
        reactiveUtils.watch(
          () => {
            return { observer: this.sightObserver, target: this.sightTarget };
          },
          ({ observer, target }) => {
            if (!!observer && !!target) {
              this.generateViewshedPlane();
            }
          }
        ),
      ]);
    },

    destroy() {
      this._setViewshedParameters({ enabled: false });

      this._restoreAccumulatorTechnique();
    },

    _setViewshedParameters(a) {
      const _renderView = this._renderView;
      maybe.isNone(_renderView) ||
        _renderView.setRenderParameters({ shadowCastOptions: a });
    },

    _replaceAccumulatorTechnique(pointShadowMatrix) {
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
          this.preserveRender._techniqueRepository,
          this.preserveRender._rctx,
          this.preserveRender._shadowAccumulator,
          this.preserveRender._requestRender
        );

      accumulator._accumulationParams = {
        ...accumulator._accumulationParams,
        pointShadowMatrix: pointShadowMatrix,
      };

      const that = this;
      accumulator._renderToShadowMap = function (
        shadowMap,
        lightDir,
        cacheCamera,
        depthRange
      ) {
        const view = window.view;
        const renderer = view._stage.renderView._renderer;

        shadowMap.start(cacheCamera, lightDir, depthRange);

        const inverseMat = mat4f64.create();
        mat4.multiply(
          inverseMat,
          cacheCamera.projectionMatrix,
          cacheCamera.viewMatrix
        );
        mat4.invert(inverseMat, inverseMat);

        // TODO: replace lightMat here
        for (let h of shadowMap.getCascades()) {
          const viewOriginV4 = vec4f64.fromValues(0, 0, 0, 1);
          vec4.transformMat4(viewOriginV4, viewOriginV4, inverseMat);
          for (let i = 0; i < 3; i += 1) {
            viewOriginV4[i] /= viewOriginV4[3];
          }

          const translatedViewMatrix = mat4f64.create();
          const viewOrigin = vec3f64.fromValues(
            viewOriginV4[0],
            viewOriginV4[1],
            viewOriginV4[2]
          );
          vec3.negate(viewOrigin, viewOrigin);
          mat4.lookAt(
            translatedViewMatrix,
            [0, 0, 0],
            [-lightDir[0], -lightDir[1], -lightDir[2]],
            cacheCamera.eye
          );
          mat4.translate(
            translatedViewMatrix,
            translatedViewMatrix,
            viewOrigin
          );
          mat4.copy(h.camera.viewMatrix, translatedViewMatrix);
          h.camera.near = 2;
          h.camera.far = 500;

          shadowMap._constructTrapezoidalProjection(
            cacheCamera.viewMatrix,
            lightDir,
            h
          );
          // mat4.copy(
          //   h.camera.projectionMatrix,
          //   that.shadowCamera.projectionMatrix
          // );

          mat4.multiply(
            h.lightMat,
            h.camera.projectionMatrix,
            h.camera.viewMatrix
          );
        }

        renderer._renderShadowCascades(4, shadowMap);
        cacheCamera.setGLViewport(accumulator._rctx);
        renderer._ensureCameraBindParameters(cacheCamera);
      };
    },

    _restoreAccumulatorTechnique() {
      const accumulator =
        this.view._stage.renderView._renderer._shadowAccumulator;

      accumulator._accumulationTechnique.release();
      if (this.preserveTechnique) {
        accumulator._accumulationTechnique = this.preserveTechnique;
        this.preserveTechnique = null;
      } else {
        accumulator._accumulationTechnique = undefined;
      }

      accumulator._accumulationRenderer.dispose();
      if (this.preserveRender) {
        accumulator._accumulationRenderer = this.preserveRender;
        accumulator._accumulationRenderer._stop();
        this.preserveRender = null;
      }
    },

    _updateShadowMapMatrices() {
      if (this.shadowCamera) {
        const vpMatrix = viewshed3DMathUtils.getGLCameraViewProjectionMatrix(
          this.shadowCamera
        );
        const accumulator =
          this.view._stage.renderView._renderer._shadowAccumulator;

        mat4.copy(accumulator._accumulationParams.pointShadowMatrix, vpMatrix);

        this._setViewshedParameters({
          pointShadowMatrix: vpMatrix,
        });
      }
    },

    generateViewshedPlane() {
      const plane = viewshed3DMathUtils.createViewPlane(
        this.sightObserver,
        this.sightTarget
      );

      const lightDirections = viewshed3DMathUtils.calculateSightDirections(
        this.sightObserver,
        plane
      );

      // const orderedIndex = [];
      // traversalUtils.breadthFirstBinaryPartitioning(0, 256, orderedIndex);
      // const ordered = Array(256);
      // for (let i = 0; i < 256; i++) {
      //   ordered[i] = lightDirections[orderedIndex[i]];
      // }

      const renderCoordinates = new Array(9);
      externalRenderers.toRenderCoordinates(
        this.view,
        [
          this.sightObserver.x,
          this.sightObserver.y,
          this.sightObserver.z,
          plane.extent.center.x,
          plane.extent.center.y,
          plane.extent.center.z,
          window.view.camera.position.x,
          window.view.camera.position.y,
          window.view.camera.position.z,
        ],
        0,
        null,
        renderCoordinates,
        0,
        3
      );

      const observerInRenderer = renderCoordinates.slice(0, 3);
      const targetInRenderer = renderCoordinates.slice(3, 6);
      const cameraInRenderer = renderCoordinates.slice(6);

      console.log("Observer Model Coords: " + observerInRenderer);
      console.log("Target Model Coords: " + targetInRenderer);
      console.log("Camera Modal Coords: " + cameraInRenderer);

      const glCamera = window.view.state.camera;
      const viewMatrix = glCamera.viewMatrix;
      const projectionMatrix = glCamera.projectionMatrix;

      const vec4ModelOb = vec4f64.fromValues(
        observerInRenderer[0],
        observerInRenderer[1],
        observerInRenderer[2],
        1.0
      );
      const vec4ModelTar = vec4f64.fromValues(
        targetInRenderer[0],
        targetInRenderer[1],
        targetInRenderer[2],
        1.0
      );
      const vec4ModalCam = vec4f64.fromValues(
        cameraInRenderer[0],
        cameraInRenderer[1],
        cameraInRenderer[2],
        1.0
      );

      const vec4ViewOb = vec4f64.create();
      const vec4ViewTar = vec4f64.create();
      const vec4ViewCam = vec4f64.create();
      vec4.transformMat4(vec4ViewOb, vec4ModelOb, viewMatrix);
      vec4.transformMat4(vec4ViewTar, vec4ModelTar, viewMatrix);
      vec4.transformMat4(vec4ViewCam, vec4ModalCam, viewMatrix);
      for (let i = 0; i < 3; i += 1) {
        vec4ViewOb[i] /= vec4ViewOb[3];
        vec4ViewTar[i] /= vec4ViewTar[3];
        vec4ViewCam[i] /= vec4ViewCam[3];
      }

      console.log("Observer View Coords: " + vec4ViewOb);
      console.log("Target View Coords: " + vec4ViewTar);
      console.log("Camera View Coords: " + vec4ViewCam);

      const vec4Projob = vec4f64.create();
      const vec4ProjTar = vec4f64.create();
      const vec4ProjCam = vec4f64.create();

      vec4.transformMat4(vec4Projob, vec4ViewOb, projectionMatrix);
      vec4.transformMat4(vec4ProjTar, vec4ViewTar, projectionMatrix);
      vec4.transformMat4(vec4ProjCam, vec4ViewCam, projectionMatrix);

      console.log("Observer Proj Coords: " + vec4Projob);
      console.log("Target Proj Coords: " + vec4ProjTar);
      console.log("Camera Proj Coords: " + vec4ProjCam);

      this.shadowCamera = viewshed3DMathUtils.glCameraFromTwoPoint(
        this.view,
        observerInRenderer,
        targetInRenderer,
        plane,
        4096,
        4096
      );
      const shadowMatrix = viewshed3DMathUtils.getGLCameraViewProjectionMatrix(
        this.shadowCamera
      );

      window.shadowCamera = this.shadowCamera;

      if (!this.customTechniqueAttached) {
        this._replaceAccumulatorTechnique(shadowMatrix);

        this.customTechniqueAttached = true;
      }
      this._updateShadowMapMatrices(this.target);

      this._setViewshedParameters({
        enabled: true,
        visualization: 0,
        color: [1, 0, 0, 0.7],
        // threshold: 0.26,
        bandsEnabled: false,
        bandSize: 0,
        lightDirections: lightDirections,
        observer: observerInRenderer,
        sightTarget: targetInRenderer,
        pointShadowMatrix: shadowMatrix,
      });
    },
  });
});
