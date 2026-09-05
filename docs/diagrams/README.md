# Diagrams

Three Excalidraw scenes, generated 5 Sep 2026 from the shipped build. Every figure in them was
read out of the running product.

Open one by dragging the `.excalidraw` file onto **excalidraw.com**, or File > Open. Every box,
arrow and label is a real editable object, so move, restyle and re-colour freely.

One thing they do not do: the arrows are **not bound** to the boxes. Drag a box and its arrows stay
put. That was deliberate, because an arrow binding written by hand can stop the whole file opening
in some builds, and a file that will not open is worse than an arrow you have to nudge. If you
rearrange much, delete an arrow and redraw it and it will bind itself.

| File | What it argues | Where it goes in the video |
|---|---|---|
| `1-layers.excalidraw` | Four layers, and only three of them are agents. Detect never calls a model. | 3:35 beat, first board |
| `2-agentic.excalidraw` | The Explain loop with its four read-only tools, and the four gates on the way out. | 3:35 beat, second board |
| `3-usp.excalidraw` | ₹1,196.92 minus ₹855.87 is ₹341.05, and ₹341.05 is ₹214.69 plus ₹126.36 exactly. | end of the demo, about 3:30 |

If only one of these survives the edit, keep `2-agentic`. Everyone in that room has an
architecture diagram. Almost nobody has a picture of the places their product refuses its own
model.

Regenerating them is not scripted. They were built once, by hand, off the figures in
`docs/VIDEO.md`. If a figure changes, fix it in the scene rather than rebuilding.
