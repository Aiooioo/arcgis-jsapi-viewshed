define([
  "exports",
  "esri/views/3d/webgl-engine/core/shaderLibrary/ScreenSpacePass",
  "esri/views/3d/webgl-engine/core/shaderLibrary/output/ReadLinearDepth.glsl",
  "esri/views/3d/webgl-engine/core/shaderLibrary/shading/ReadShadowMap.glsl",
  "esri/views/3d/webgl-engine/core/shaderLibrary/util/CameraSpace.glsl",
  "esri/views/3d/webgl-engine/core/shaderLibrary/util/RgbaFloatEncoding.glsl",
  "esri/views/3d/webgl-engine/core/shaderModules/interfaces",
  "esri/views/3d/webgl-engine/core/shaderModules/ShaderBuilder",
], function (
  exports,
  ScreenSpacePass,
  ReadLinearDepthGlsl,
  ReadShadowMapGlsl,
  CameraSpaceGlsl,
  RgbaFloatEncodingGlsl,
  shaderInterfaces,
  ShaderBuilder
) {
  function f(d) {
    const builder = new ShaderBuilder.ShaderBuilder();
    builder.fragment.include(RgbaFloatEncodingGlsl.RgbaFloatEncoding);
    builder.fragment.include(ReadLinearDepthGlsl.ReadLinearDepth);
    builder.include(CameraSpaceGlsl.CameraSpace);
    builder.include(ScreenSpacePass.ScreenSpacePass);

    var { pass: b } = d;
    if (1 === b) {
      const { visualization: g, bandsEnabled: h } = d;
      builder.include(ReadShadowMapGlsl.ReadShadowMap);
      // builder.varyings.add("vClip_pos", "vec4");
      builder.fragment.uniforms.add("observer", "vec4");
      builder.fragment.uniforms.add("sightTarget", "vec4");
      builder.fragment.uniforms.add("pointShadowMatrix", "mat4");
      builder.fragment.uniforms.add("inverseProjMatrix", "mat4");
      builder.fragment.uniforms.add("inverseViewMatrix", "mat4");
      builder.fragment.uniforms.add("shadowCameraViewMatrix", "mat4");
      builder.fragment.uniforms.add("depthMap", "sampler2D");
      builder.fragment.uniforms.add("inverseView", "mat4");
      builder.fragment.uniforms.add("nearFar", "vec2");
      builder.fragment.constants.add("inverseSampleValue", "float", 255);
      builder.fragment.uniforms.add("shadowCastMap", "sampler2D");
      builder.fragment.uniforms.add("videoMap", "sampler2D");
      builder.fragment.uniforms.add("sampleScale", "float");
      builder.fragment.uniforms.add("opacityFromElevation", "float");
      d = 0 === g;
      b = 1 === g;
      builder.fragment.uniforms.add("color", "vec4");
      d
        ? h && builder.fragment.uniforms.add("bandSize", "float")
        : b && builder.fragment.uniforms.add("threshold", "float");

      builder.fragment.code.add(shaderInterfaces.glsl`
          void main(void) {
            float depth = rgba2float(texture2D(depthMap, uv));
            float currentPixelDepth = linearDepthFromFloat(depth, nearFar);
            vec4 currentPixelPos = vec4(reconstructPosition(gl_FragCoord.xy, currentPixelDepth), 1.0);
            vec4 worldSpacePos = inverseView * currentPixelPos;

            vec4 lightSpacePos = pointShadowMatrix * vec4(worldSpacePos.xyz, 1.0);
            lightSpacePos.xy /= lightSpacePos.w;
            vec3 lightSpacePoi = lightSpacePos.xyz * 0.5 + vec3(0.5);


            if (lightSpacePoi.z < 10.0 || lightSpacePoi.z > 120.0 || lightSpacePoi.x < 0.0 || lightSpacePoi.x > 1.0 || lightSpacePoi.y < 0.0 || lightSpacePoi.y > 1.0) {
              discard;
            }

            vec2 uvVideo = lightSpacePoi.xy;

            vec4 videoColor = texture2D(videoMap, uvVideo);
            
            gl_FragColor = vec4(videoColor.xyz, color.a);
          }
        `);
    } else if (0 === b || 2 === b) {
      builder.include(ReadShadowMapGlsl.ReadShadowMap);
      builder.fragment.uniforms.add("depthMap", "sampler2D");
      builder.fragment.uniforms.add("inverseView", "mat4");
      builder.fragment.uniforms.add("pointShadowMatrix", "mat4");
      builder.fragment.uniforms.add("nearFar", "vec2");
      0 === b
        ? builder.fragment.constants.add("sampleValue", "float", r)
        : builder.fragment.constants.add(
            "shadowColor",
            "vec4",
            [1.0, 0, 0, 0.8]
          );

      builder.fragment.code.add(shaderInterfaces.glsl`
            void main(void) {
      
              float depth = rgba2float(texture2D(depthMap, uv));

              // 0.0 is the clear value of depthMap, which means nothing has been drawn there and we should discard
              if (depth == 0.0) {
                discard;
              }
      
              float currentPixelDepth = linearDepthFromFloat(depth, nearFar);
            
              if (-currentPixelDepth > nearFar.y || -currentPixelDepth < nearFar.x) {
                discard;
              }
      
              vec4 currentPixelPos = vec4(reconstructPosition(gl_FragCoord.xy, currentPixelDepth), 1.0);
              vec4 worldSpacePos = inverseView * currentPixelPos;

              mat4 shadowMatrix;
              float linearDepth = -currentPixelDepth; 
              int i = chooseCascade(linearDepth, shadowMatrix);
      
              if (i >= uShadowMapNum) {
                discard;
              }

              // shadowMatrix = pointShadowMatrix;
      
              vec3 lvpos = lightSpacePosition(worldSpacePos.xyz, shadowMatrix);

              // vertex completely outside? -> no shadow
              if (lvpos.z >= 1.0 || lvpos.x < 0.0 || lvpos.x > 1.0 || lvpos.y < 0.0 || lvpos.y > 1.0) {
                discard;
              }

              vec2 uvShadow = cascadeCoordinates(i, lvpos);
      
              float depthShadow = readShadowMapDepth(uvShadow, uShadowMapTex);
              bool shadow = depthShadow < lvpos.z;
      
              if (!shadow) {
                discard;
              }
      
              gl_FragColor = ${
                0 === b
                  ? shaderInterfaces.glsl`vec4(sampleValue)`
                  : shaderInterfaces.glsl`shadowColor`
              };
            }
          `);
    }

    return builder;
  }

  const r = 1 / 255;
  const shader = Object.freeze({
    __proto__: null,
    shadowCastMaxSamples: 255,
    build: f,
  });

  exports.ShadowCastShader = shader;
  exports.build = f;
  exports.shadowCastMaxSamples = 255;
});
