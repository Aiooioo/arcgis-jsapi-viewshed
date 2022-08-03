define([
  "exports",
  "esri/chunks/_rollupPluginBabelHelpers",
  "esri/chunks/vec2f64",
  "esri/chunks/mat4",
  "esri/chunks/mat4f64",
  "esri/core/maybe",
  "esri/chunks/vec4",
  "esri/chunks/vec4f64",
  "esri/views/3d/webgl-engine/lib/glUtil3D",
  "viewshed/Viewshed3DTechnique",
  "esri/views/webgl/Util",
], function (
  exports,
  _rollupPluginBabelHelpers,
  vec2f64,
  mat4,
  mat4f64,
  maybe,
  vec4,
  vec4f64,
  glUtil3D,
  Viewshed3DTechnique,
  webglUtil
) {
  var q = vec4f64.fromValues(0.01, 0, 0.25, 1),
    l = 1 / 512;

  var Viewshed3DRenderer = (function () {
    function g(a, b, r, t) {
      this._techniqueRepository = a;
      this._rctx = b;
      this._shadowAccumulator = r;
      this._requestRender = t;
      this._visualizationParams = {
        shadowCastMap: this._shadowCastTexture,
        sampleScale: 0,
        color: q,
        threshold: 0.5,
        bandSize: 0.1,
        opacityFromElevation: 1,
        observer: vec4f64.create(),
        sightTarget: vec4f64.create(),
        pointShadowMatrix: mat4f64.create(),
      };
      this._techniqueConfig =
        new Viewshed3DTechnique.Viewshed3DTechniqueConfiguration();
      this._enabled = !1;
      this._vao = glUtil3D.createQuadVAO(b);

      this._techniqueConfig.pass = 1;
      this._techniqueConfig.visualization = 0;
    }
    var c = g.prototype;
    c.normalizeCtorArgs = function () {
      return {};
    };
    c.dispose = function () {
      this._stop();
      this._vao = maybe.disposeMaybe(this._vao);
      this._techniqueRepository.release(this._technique);
      this._technique = null;
      this._shadowAccumulator = null;
    };
    c.render = function () {
      if (this._isRenderingVisualization) {
        this._sampleScale = 1 / this._computedSamples;
        this._rctx.bindVAO(this._vao);
        const e = this.visualizeShadowCastTechnique;

        this._rctx.useTechnique(e);
        e.bindPass({
          ...this._visualizationParams,
          shadowAccumulator: this._shadowAccumulator,
        });
        this._rctx.drawArrays(
          e.primitiveType,
          0,
          webglUtil.vertexCount(this._vao, "geometry")
        );
      }
    };
    c.setOptions = function (a) {
      void 0 !== a.enabled && this._setEnabled(a.enabled);
      void 0 !== a.color && this._setColor(a.color);
      void 0 !== a.threshold && (this._threshold = a.threshold);
      void 0 !== a.visualization && (this._visualization = a.visualization);
      void 0 !== a.bandSize && (this._bandSize = a.bandSize);
      void 0 !== a.bandsEnabled && (this._bandsEnabled = a.bandsEnabled);
      void 0 !== a.observer && (this.observer = a.observer);
      void 0 !== a.sightTarget && (this.sightTarget = a.sightTarget);
      void 0 !== a.pointShadowMatrix &&
        (this._pointShadowMatrix = a.pointShadowMatrix);
    };
    c._setColor = function (a) {
      vec4.exactEquals(a, this._visualizationParams.color) ||
        (vec4.copy(this._visualizationParams.color, a),
        this._requestRenderIfRunning());
    };
    c._setEnabled = function (a) {
      a !== this._enabled && (a ? this._start() : this._stop());
    };
    c._requestRenderIfRunning = function () {
      this._enabled && this._requestRender();
    };
    c._start = function () {
      this._enabled = !0;
      this._requestRender();
    };
    c._stop = function () {
      this._enabled = !1;
      this._requestRender();
    };
    _rollupPluginBabelHelpers._createClass(g, [
      {
        key: "visualizeShadowCastTechnique",
        get: function () {
          return (
            (this._technique = this._techniqueRepository.releaseAndAcquire(
              Viewshed3DTechnique.Viewshed3DTechnique,
              this._techniqueConfig,
              this._technique
            )),
            this._technique
          );
        },
      },
      {
        key: "opacityFromElevation",
        get: function () {
          return this._visualizationParams.opacityFromElevation;
        },
        set: function (a) {
          this._visualizationParams.opacityFromElevation = a;
        },
      },
      {
        key: "observer",
        get: function () {
          return this._visualizationParams.observer;
        },
        set: function (a) {
          this._visualizationParams.observer[0] = a[0];
          this._visualizationParams.observer[1] = a[1];
          this._visualizationParams.observer[2] = a[2];
          this._visualizationParams.observer[3] = a[3];
        },
      },
      {
        key: "sightTarget",
        get: function () {
          return this._visualizationParams.sightTarget;
        },
        set: function (a) {
          this._visualizationParams.sightTarget[0] = a[0];
          this._visualizationParams.sightTarget[1] = a[1];
          this._visualizationParams.sightTarget[2] = a[2];
          this._visualizationParams.sightTarget[3] = a[3];
        },
      },
      {
        key: "_pointShadowMatrix",
        get: function () {
          return this._visualizationParams.pointShadowMatrix;
        },
        set: function (a) {
          mat4.copy(this._visualizationParams.pointShadowMatrix, a);

          this._requestRenderIfRunning();
        },
      },
      {
        key: "_isRenderingVisualization",
        get: function () {
          return (
            this._enabled &&
            0 < this._computedSamples &&
            this.opacityFromElevation > l
          );
        },
      },
      {
        key: "_computedSamples",
        get: function () {
          return this._shadowAccumulator.computedSamples;
        },
      },
      {
        key: "_shadowCastTexture",
        get: function () {
          return this._shadowAccumulator.shadowCastTexture;
        },
      },
      {
        key: "_sampleScale",
        get: function () {
          return this._visualizationParams.sampleScale;
        },
        set: function (a) {
          this._visualizationParams.sampleScale = a;
        },
      },
      {
        key: "_threshold",
        get: function () {
          return this._visualizationParams.threshold;
        },
        set: function (a) {
          this._threshold !== a &&
            ((this._visualizationParams.threshold = a),
            this._requestRenderIfRunning());
        },
      },
      {
        key: "_visualization",
        get: function () {
          return this._techniqueConfig.visualization;
        },
        set: function (e) {
          e !== this._visualization &&
            ((this._techniqueConfig.visualization = e),
            this._techniqueRepository.release(this._technique),
            (this._technique = null),
            this._requestRenderIfRunning());
        },
      },
      {
        key: "_bandSize",
        get: function () {
          return this._visualizationParams.bandSize;
        },
        set: function (a) {
          a !== this._bandSize &&
            ((this._visualizationParams.bandSize = a),
            this._requestRenderIfRunning());
        },
      },
      {
        key: "_bandsEnabled",
        get: function () {
          return this._techniqueConfig.bandsEnabled;
        },
        set: function (e) {
          e !== this._bandsEnabled &&
            ((this._techniqueConfig.bandsEnabled = e),
            this._techniqueRepository.release(this._technique),
            (this._technique = null),
            this._requestRenderIfRunning());
        },
      },
    ]);

    return g;
  })();

  exports.ShadowCastRenderer = Viewshed3DRenderer;
  exports.shadowCastDisableElevationMax = 5e4;
  exports.shadowCastDisableElevationMin = 4e4;
  exports.shadowCastDisabledElevationThreshold = l;
  Object.defineProperty(exports, "__esModule", { value: !0 });
});
