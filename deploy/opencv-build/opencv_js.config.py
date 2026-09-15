# Copyright (c) 2026 Ada Technology. MIT License.
# Whitelist do OpenCV.js da medida pela câmera (spec 152, ADR-0065): só o que o worker usa.
# cv.Mat, MatVector, Scalar, Size, matFromArray e matFromImageData vêm do core_bindings.cpp e do
# helpers.js, sempre presentes; esta lista governa só as funções geradas a partir dos headers.

core = {
    '': ['copyMakeBorder', 'meanStdDev'],
    # Base de aruco_ArucoDetector: sem ela o embind recusa construir o detector (tipo não ligado).
    'Algorithm': [],
}

imgproc = {
    '': ['cvtColor', 'getPerspectiveTransform', 'Laplacian', 'resize', 'warpPerspective'],
}

objdetect = {
    '': ['getPredefinedDictionary', 'generateImageMarker'],
    'aruco_PredefinedDictionaryType': [],
    'aruco_Dictionary': ['Dictionary', 'generateImageMarker'],
    'aruco_DetectorParameters': ['DetectorParameters'],
    'aruco_RefineParameters': ['RefineParameters'],
    'aruco_ArucoDetector': ['ArucoDetector', 'detectMarkers'],
}

white_list = makeWhiteList([core, imgproc, objdetect])
