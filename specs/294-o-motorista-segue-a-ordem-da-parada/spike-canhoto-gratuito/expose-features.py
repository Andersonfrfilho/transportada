# Copyright (c) 2026 Ada Technology. MIT License.
# Expõe a penúltima camada (1280) da MobileNetV3-Large ONNX como saída.
import onnx, sys
m = onnx.load(sys.argv[1])
g = m.graph
g.node.remove(g.node[-1])
del g.output[:]
g.output.append(onnx.helper.make_tensor_value_info('/flatten/Flatten_output_0', onnx.TensorProto.FLOAT, ['batch', 1280]))
onnx.checker.check_model(m)
onnx.save(m, sys.argv[2])
print('ok')
