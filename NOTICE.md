# Notices

moe2d includes components of the Live2D Cubism SDK for Web 5-r.5, © Live2D Inc.

## Live2D Cubism Core

The Cubism Core (`live2dcubismcore.min.js`, bundled in the `core` chunk) is Redistributable Code under the [Live2D Proprietary Software License Agreement](https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html).

## Live2D Cubism Framework

The Cubism Web Framework (bundled in the `model` chunk) is under the [Live2D Open Software License Agreement](https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html). moe2d changes it in these ways:

- The WebGL shaders are inlined instead of fetched from a directory.
- `CubismShaderManager_WebGL.removeGlContext` releases the shaders of one WebGL context.
- `CSM_ASSERT` calls `console.assert` only when its check fails.

## Cubism SDK Release License

A business with annual gross revenue of 10 million JPY or more in its most recent fiscal year must obtain a [Cubism SDK Release License](https://www.live2d.com/en/sdk/license/) before releasing content that uses the Cubism SDK.
