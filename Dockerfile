# The playground: Emscripten builds the WebAssembly module, nginx serves it.
# Build it: docker build -t multiview-playground .
# Run it:   docker run --rm -p 8080:8080 multiview-playground   (http://localhost:8080)

FROM emscripten/emsdk:6.0.13 AS wasm
WORKDIR /src
COPY include include
COPY playground playground
COPY Makefile .
RUN make playground EMCC=em++ BUILD=/tmp/build

FROM nginx:1.30-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/headers.conf /etc/nginx/headers.conf
COPY --from=wasm /src/playground/web /usr/share/nginx/html
