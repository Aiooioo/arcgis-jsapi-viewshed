define([
  "exports",
  "esri/chunks/_rollupPluginBabelHelpers",
  "esri/core/maybe",
  "esri/chunks/vec2f64",
  "esri/chunks/vec4",
  "esri/chunks/vec4f64",
  "esri/chunks/mat4",
  "esri/chunks/mat4f64",
  "esri/views/3d/webgl-engine/lib/glUtil3D",
  "esri/views/3d/webgl-engine/lib/Texture",
  "esri/views/3d/webgl-engine/lib/TextureTechnique",
  // 'esri/views/3d/webgl-engine/shaders/ShadowCastTechnique',
  "videotexture/VideoTextureTechnique",
  "esri/views/webgl/Util",
], function (
  exports,
  _rollupPluginBabelHelpers,
  maybe,
  vec2f64,
  vec4,
  vec4f64,
  mat4,
  mat4f64,
  glUtil3D,
  Texture,
  TextureTechnique,
  Viewshed3DTechnique,
  webglUtil
) {
  var q = vec4f64.fromValues(0.01, 0, 0.25, 1),
    l = 1 / 512;

  var Viewshed3DRenderer = (function () {
    function g(a, b, r, t) {
      this._techniqueRep = a;
      this._rctx = b;
      this._shadowAccumulator = r;
      this._requestRender = t;
      this._enabled = !1;
      this._vao = glUtil3D.createQuadVAO(b);
      this._visualizationConfig =
        new Viewshed3DTechnique.Viewshed3DTechniqueConfiguration();
      this._visualizationConfig.pass = 1;
      this._visualizationConfig.visualization = 0;
      this._visualizeShadowCastTechnique = a.acquire(
        Viewshed3DTechnique.Viewshed3DTechnique,
        this._visualizationConfig
      );

      this.videoTexture = new Texture.Texture(window.video);
      this._textureTechnique = a.acquire(
        TextureTechnique.TextureTechnique,
        new TextureTechnique.TextureTechniqueConfiguration()
      );
      this.videoTexture.load(this._rctx, this._textureTechnique);

      this._visualizationParams = {
        shadowCastMap: this._shadowCastTexture,
        sampleScale: 0,
        color: q,
        threshold: 0.5,
        bandSize: 0.1,
        opacityFromElevation: 1,
        observer: vec4f64.create(),
        sightTarget: vec4f64.create(),
        lt: vec2f64.create(),
        rt: vec2f64.create(),
        lb: vec2f64.create(),
        rb: vec2f64.create(),
        pointShadowMatrix: mat4f64.create(),
        shadowCameraViewMatrix: mat4f64.create(),
        videoMap: this.videoTexture,
        // groundCenter: vec4f64.create(),
        // groundCenter2: vec4f64.create(),
      };
    }
    var c = g.prototype;
    c.dispose = function () {
      this._stop();
      this._vao = maybe.disposeMaybe(this._vao);
      this._visualizeShadowCastTechnique = maybe.disposeMaybe(
        this._visualizeShadowCastTechnique
      );
      this._shadowAccumulator = null;
    };
    c.render = function () {
      if (this._isRenderingVisualization) {
        this._sampleScale = 1 / this._computedSamples;
        this._rctx.bindVAO(this._vao);
        this._rctx.useProgram(this._visualizeShadowCastTechnique.program);
        this._visualizeShadowCastTechnique.bindPipelineState(this._rctx);
        this._visualizeShadowCastTechnique.bindPass({
          ...this._visualizationParams,
          shadowAccumulator: this._shadowAccumulator,
        });
        this._rctx.drawArrays(
          this._visualizeShadowCastTechnique.primitiveType,
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
      void 0 !== a.groundCenter && (this.groundCenter = a.groundCenter);
      void 0 !== a.groundCenter2 && (this.groundCenter2 = a.groundCenter2);
      void 0 !== a.pointShadowMatrix &&
        (this._pointShadowMatrix = a.pointShadowMatrix);
      void 0 !== a.shadowCameraViewMatrix &&
        (this._shadowCameraViewMatrix = a.shadowCameraViewMatrix);
      void 0 !== a.lt && (this._lt = a.lt);
      void 0 !== a.rt && (this._rt = a.rt);
      void 0 !== a.lb && (this._lb = a.lb);
      void 0 !== a.rb && (this._rb = a.rb);
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
        key: "opacityFromElevation",
        get: function () {
          return this._visualizationParams.opacityFromElevation;
        },
        set: function (a) {
          this._visualizationParams.opacityFromElevation = a;
        },
      },
      {
        key: "groundCenter",
        get: function () {
          return this._visualizationParams.groundCenter;
        },
        set: function (a) {
          this._visualizationParams.groundCenter[0] = a[0];
          this._visualizationParams.groundCenter[1] = a[1];
          this._visualizationParams.groundCenter[2] = a[2];
          this._visualizationParams.groundCenter[3] = a[3];
        },
      },
      {
        key: "groundCenter2",
        get: function () {
          return this._visualizationParams.groundCenter2;
        },
        set: function (a) {
          this._visualizationParams.groundCenter2[0] = a[0];
          this._visualizationParams.groundCenter2[1] = a[1];
          this._visualizationParams.groundCenter2[2] = a[2];
          this._visualizationParams.groundCenter2[3] = a[3];
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
          // this._visualizationParams.observer[3] = a[3];
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
          // this._visualizationParams.sightTarget[3] = a[3];
        },
      },
      {
        key: "_lt",
        get() {
          return this._visualizationParams.lt;
        },
        set(a) {
          this._visualizationParams.lt[0] = a[0];
          this._visualizationParams.lt[1] = a[1];
        },
      },
      {
        key: "_rt",
        get() {
          return this._visualizationParams.rt;
        },
        set(a) {
          this._visualizationParams.rt[0] = a[0];
          this._visualizationParams.rt[1] = a[1];
        },
      },
      {
        key: "_lb",
        get() {
          return this._visualizationParams.lb;
        },
        set(a) {
          this._visualizationParams.lb[0] = a[0];
          this._visualizationParams.lb[1] = a[1];
        },
      },
      {
        key: "_rb",
        get() {
          return this._visualizationParams.rb;
        },
        set(a) {
          this._visualizationParams.rb[0] = a[0];
          this._visualizationParams.rb[1] = a[1];
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
          return this._visualizationConfig.visualization;
        },
        set: function (a) {
          if (a !== this._visualization) {
            var b = this._visualizationConfig;
            b.visualization = a;
            this._visualizeShadowCastTechnique =
              this._techniqueRep.releaseAndAcquire(
                Viewshed3DTechnique.Viewshed3DTechnique,
                b,
                this._visualizeShadowCastTechnique
              );
            this._requestRenderIfRunning();
          }
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
        key: "_shadowCameraViewMatrix",
        get: function () {
          return this._visualizationParams.shadowCameraViewMatrix;
        },
        set: function (a) {
          mat4.copy(this._visualizationParams.shadowCameraViewMatrix, a);

          this._requestRenderIfRunning();
        },
      },
      {
        key: "_bandsEnabled",
        get: function () {
          return this._visualizationConfig.bandsEnabled;
        },
        set: function (a) {
          if (a !== this._bandsEnabled) {
            var b = this._visualizationConfig;
            b.bandsEnabled = a;
            this._visualizeShadowCastTechnique =
              this._techniqueRep.releaseAndAcquire(
                Viewshed3DTechnique.Viewshed3DTechnique,
                b,
                this._visualizeShadowCastTechnique
              );
            this._requestRenderIfRunning();
          }
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
