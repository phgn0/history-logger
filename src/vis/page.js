console.log("ok");

var G = new jsnx.DiGraph();

G.addNodesFrom([1, 2, 3, 4, 5, [9, { color: "#008A00" }]], {
    color: "#0064C7"
});
G.addCycle([1, 2, 3, 4, 5]);
G.addEdgesFrom([[1, 9], [9, 1]]);

jsnx.draw(G, {
    element: "#graph",
    withLabels: true,
    nodeStyle: {
        fill: function(d) {
            return d.data.color;
        }
    },
    labelStyle: { fill: "white" },
    stickyDrag: true
});
