const canvas = document.querySelector<HTMLCanvasElement>("#crt-shader");

if (canvas) {
  const gl = canvas.getContext("webgl", { alpha: true, antialias: false });

  if (gl) {
    const vertexSource = `
      attribute vec2 position;
      void main() { gl_Position = vec4(position, 0.0, 1.0); }
    `;
    const fragmentSource = `
      precision mediump float;
      uniform vec2 resolution;
      void main() {
        vec2 uv = gl_FragCoord.xy / resolution;
        float scanline = 0.045 * (0.5 + 0.5 * sin(gl_FragCoord.y * 3.14159265));
        float edge = smoothstep(0.92, 0.28, length(uv - 0.5) * 1.4142) * 0.15;
        gl_FragColor = vec4(vec3(0.0), scanline + edge);
      }
    `;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    const render = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.ceil(window.innerWidth * pixelRatio);
      const height = Math.ceil(window.innerHeight * pixelRatio);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (document.documentElement.dataset.crt !== "on") return;
      gl.useProgram(program);
      const position = gl.getAttribLocation(program, "position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(gl.getUniformLocation(program, "resolution"), width, height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    document.addEventListener("astrosphere:crt-change", render);
    document.addEventListener("astro:page-load", render);
    window.addEventListener("resize", () => requestAnimationFrame(render), { passive: true });
    render();
  }
}
