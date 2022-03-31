const cdktf = require('cdktf');
cdktf.Testing.setupJest();
afterEach(() => {
  if (global.gc) {
    global.gc();
  }
});
