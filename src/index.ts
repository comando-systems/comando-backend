Bun.serve({
  port: 8080,
  routes: {
    "/": (req) => {
      return Response.json({req: req.destination});
    },
    "/AWSD": (req) => {
        console.log(req);
        
      return Response.json({req: req.destination});
    },
  },
  fetch() {
    return new Response("Unmatched route");
  },
});
