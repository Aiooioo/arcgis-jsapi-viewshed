define([
  "esri/chunks/vec3",
  "esri/chunks/vec3f64",
  "esri/chunks/vec4f64",
  "esri/chunks/mat3",
  "esri/chunks/mat3f64",
  "esri/chunks/mat4",
  "esri/chunks/mat4f64",
  "esri/geometry/Mesh",
  "esri/geometry/Point",
  "esri/views/3d/webgl-engine/lib/Camera",
  "esri/views/3d/externalRenderers",
], function (
  vec3,
  vec3f64,
  vec4f64,
  mat3,
  mat3f64,
  mat4,
  mat4f64,
  Mesh,
  Point,
  WebGLEngineCamera,
  externalRenderers
) {
  const densifyMaxSegLen = 256;

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

  function createViewPlane(origin, target) {
    var viewshed = Mesh.createPlane(target, {
      size: 300,
      unit: "meters",
      material: {
        color: "rgba(255,0,0,0.7)",
      },
    });

    // fix plane z-values
    for (let i = 2; i < viewshed.vertexAttributes.position.length; i += 3) {
      viewshed.vertexAttributes.position[i] = target.z;
    }

    var up = vec3f64.fromArray([0, 0, 1]);
    var dir = vec3f64.fromArray([
      target.x - origin.x,
      target.y - origin.y,
      target.z - origin.z,
    ]);
    var a = vec3f64.create();
    var b = vec3f64.create();
    vec3.normalize(a, up);
    vec3.normalize(b, dir);

    var v = vec3f64.create();
    vec3.cross(v, a, b);
    var c = vec3.dot(a, b);

    var vx = mat3f64.fromValues(0, v[2], -v[1], -v[2], 0, v[0], v[1], -v[0], 0);
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

    return viewshed;
  }

  function calculateSightDirections(origin, viewshed) {
    const vOrigin = vec3f64.fromArray([origin.x, origin.y, origin.z]);

    const vCenter = vec3f64.fromArray([
      viewshed.extent.center.x,
      viewshed.extent.center.y,
      viewshed.extent.center.z,
    ]);

    const vDir = vec3f64.create();
    vec3.sub(vDir, vOrigin, vCenter);
    vec3.normalize(vDir, vDir);

    return range(256).map(() => vDir);
  }

  function glCameraFromTwoPoint(view, observer, target, viewPlane, fovX, fovY) {
    const upInRenderCoords = vec3f64.create();
    const planeRenderCoords = new Array(12);

    externalRenderers.toRenderCoordinates(
      view,
      viewPlane.vertexAttributes.position,
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
      topCenterRenderCoord[0] - observer[0],
      topCenterRenderCoord[1] - observer[1],
      topCenterRenderCoord[2] - observer[2]
    );
    const dirSightTargetVec3 = vec3f64.fromValues(
      target[0] - observer[0],
      target[1] - observer[1],
      target[2] - observer[2]
    );
    const dirShadowCameraRight = vec3f64.create();
    vec3.cross(dirShadowCameraRight, dirSightTargetVec3, dirOb2TopCenter);
    vec3.cross(upInRenderCoords, dirShadowCameraRight, dirSightTargetVec3);

    const shadowCamera = new WebGLEngineCamera.default(
      observer,
      target,
      upInRenderCoords
    );
    shadowCamera.near = 2;
    shadowCamera.far = 300;
    shadowCamera.width = fovX;
    shadowCamera.height = fovY;

    return shadowCamera;
  }

  function getGLCameraViewProjectionMatrix(glCamera) {
    const shadowProjectionMatrix = glCamera.projectionMatrix;
    const shadowViewMatrix = glCamera.viewMatrix;
    const shadowCameraVPMatrix = mat4f64.create();
    mat4.multiply(
      shadowCameraVPMatrix,
      shadowProjectionMatrix,
      shadowViewMatrix
    );

    return shadowCameraVPMatrix;
  }

  const utils = {
    createViewPlane: createViewPlane,
    calculateSightDirections: calculateSightDirections,
    glCameraFromTwoPoint,
    getGLCameraViewProjectionMatrix,
  };

  return utils;
});
