define([
  "require",
  "exports",
  "esri/chunks/vec4f64",
  "esri/chunks/mat4",
  "esri/chunks/mat4f64",
  "esri/chunks/_rollupPluginBabelHelpers",
  "esri/chunks/tslib.es6",
  "esri/views/3d/webgl-engine/core/shaderTechnique/ReloadableShaderModule",
  "esri/views/3d/webgl-engine/core/shaderTechnique/ShaderTechnique",
  "esri/views/3d/webgl-engine/core/shaderTechnique/ShaderTechniqueConfiguration",
  "esri/views/3d/webgl-engine/lib/DefaultVertexAttributeLocations",
  "esri/views/3d/webgl-engine/lib/OrderIndependentTransparency",
  "esri/views/3d/webgl-engine/lib/Program",
  "viewshed/Viewshed3D.glsl",
  "esri/views/webgl/renderState",
], function (
  require,
  exports,
  vec4f64,
  mat4,
  mat4f64,
  _rollupPluginBabelHelpers,
  tslib,
  ReloadableShaderModule,
  ShaderTechnique,
  ShaderTechniqueConfiguration,
  DefaultVertexAttributeLocations,
  OrderIndependentTransparency,
  Program,
  ShadowCastGlsl,
  renderState
) {
  var Viewshed3DTechnique = (function (d) {
    function b(a, q) {
      var r;
      return (r = d.call(this, a, q, () => r.destroy()) || this);
    }
    _rollupPluginBabelHelpers._inheritsLoose(b, d);
    var c = b.prototype;
    c.initializeProgram = function (a) {
      var u = b.shader.get().build(this.configuration);
      return new Program.Program(
        a.rctx,
        u,
        DefaultVertexAttributeLocations.Default3D
      );
    };
    c.initializePipeline = function (a) {
      return 0 === this.configuration.pass
        ? renderState.makePipelineState({
            blending: renderState.separateBlendingParams(1, 1, 1, 1),
            colorWrite: renderState.defaultColorWriteParams,
            depthTest: null,
            depthWrite: null,
          })
        : 1 === this.configuration.pass || 2 === this.configuration.pass
        ? renderState.makePipelineState({
            blending: OrderIndependentTransparency.blendingDefault,
            colorWrite: renderState.defaultColorWriteParams,
            depthTest: null,
            depthWrite: null,
          })
        : renderState.makePipelineState({});
    };
    c.bindPass = function (a) {
      if (0 === this.configuration.pass || 2 === this.configuration.pass) {
        this.program.bindTexture(a.linearDepthTexture, "depthMap");
        a.shadowMap.bind(this.program);
        a.shadowMap.bindView(this.program, a.camera.center);
        this.program.setUniform2fv("nearFar", a.camera.nearFar);
        this.program.setUniformMatrix4fv("inverseView", a.inverseViewMatrix);
        // const glCamera = window.view._stage.state.camera;
        // const shadowMatrix = mat4f64.create();
        // mat4.translate(shadowMatrix, a.pointShadowMatrix, glCamera.center);
        // this.program.setUniformMatrix4fv("pointShadowMatrix", shadowMatrix);
        this.program.setUniform4fv("projInfo", a.projInfo);
        this.program.setUniform2fv("zScale", a.zScale);
      } else if (1 === this.configuration.pass) {
        this.program.bindTexture(a.shadowCastMap, "shadowCastMap");
        this.program.bindTexture(
          a.shadowAccumulator._accumulationParams.linearDepthTexture,
          "depthMap"
        );
        a.shadowAccumulator._shadowMap.bind(this.program);
        a.shadowAccumulator._shadowMap.bindView(
          this.program,
          a.shadowAccumulator._accumulationParams.camera.center
        );

        const glCamera = window.view._stage.state.camera;
        const screenObserver = glCamera.projectToRenderScreen(
          [a.observer[0], a.observer[1], a.observer[2]],
          new Array(3)
        );
        const screenTarget = glCamera.projectToRenderScreen(
          [a.sightTarget[0], a.sightTarget[1], a.sightTarget[2]],
          new Array(3)
        );
        const shadowMatrix = mat4f64.create();
        mat4.translate(shadowMatrix, a.pointShadowMatrix, glCamera.center);

        this.program.setUniform4fv(
          "observer",
          vec4f64.fromValues(
            screenObserver[0],
            screenObserver[1],
            screenObserver[2],
            1.0
          )
        );
        this.program.setUniform4fv(
          "sightTarget",
          vec4f64.fromValues(
            screenTarget[3],
            screenTarget[4],
            screenTarget[5],
            1.0
          )
        );
        this.program.setUniformMatrix4fv("pointShadowMatrix", shadowMatrix);

        this.program.setUniform2fv(
          "nearFar",
          a.shadowAccumulator._accumulationParams.camera.nearFar
        );
        this.program.setUniformMatrix4fv(
          "inverseView",
          a.shadowAccumulator._accumulationParams.inverseViewMatrix
        );
        this.program.setUniform4fv(
          "projInfo",
          a.shadowAccumulator._accumulationParams.projInfo
        );
        this.program.setUniform2fv(
          "zScale",
          a.shadowAccumulator._accumulationParams.zScale
        );
        this.program.setUniform1f("sampleScale", a.sampleScale);
        this.program.setUniform1f(
          "opacityFromElevation",
          a.opacityFromElevation
        );
        this.program.setUniform4fv("color", a.color);
        if (
          0 === this.configuration.visualization &&
          this.configuration.bandsEnabled
        ) {
          this.program.setUniform1f("bandSize", a.bandSize);
        } else if (1 === this.configuration.visualization)
          this.program.setUniform1f("threshold", a.threshold);
      }
    };
    _rollupPluginBabelHelpers._createClass(b, [
      {
        key: "primitiveType",
        get: function () {
          return 5;
        },
      },
    ]);

    return b;
  })(ShaderTechnique.ShaderTechnique);
  Viewshed3DTechnique.shader =
    new ReloadableShaderModule.ReloadableShaderModule(
      ShadowCastGlsl.ShadowCast,
      () =>
        new Promise(function (d, b) {
          require(["./Viewshed3D.glsl"], d, b);
        })
    );

  var Viewshed3DTechniqueConfiguration = (function (d) {
    function b() {
      var c = d.apply(this, arguments) || this;
      c.pass = 0;
      c.visualization = 0;
      c.bandsEnabled = !1;
      return c;
    }
    _rollupPluginBabelHelpers._inheritsLoose(b, d);

    return b;
  })(ShaderTechniqueConfiguration.ShaderTechniqueConfiguration);

  tslib.__decorate(
    [ShaderTechniqueConfiguration.parameter({ count: 3 })],
    Viewshed3DTechniqueConfiguration.prototype,
    "pass",
    void 0
  );

  tslib.__decorate(
    [ShaderTechniqueConfiguration.parameter()],
    Viewshed3DTechniqueConfiguration.prototype,
    "visualization",
    void 0
  );

  tslib.__decorate(
    [ShaderTechniqueConfiguration.parameter()],
    Viewshed3DTechniqueConfiguration.prototype,
    "bandsEnabled",
    void 0
  );

  exports.Viewshed3DTechnique = Viewshed3DTechnique;
  exports.Viewshed3DTechniqueConfiguration = Viewshed3DTechniqueConfiguration;
  Object.defineProperty(exports, "__esModule", { value: !0 });
});
