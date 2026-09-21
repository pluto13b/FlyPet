// Electron's native int converter rejects JavaScript -0. Adding +0 normalizes it.
exports.pixel = value => Math.round(value) + 0;
