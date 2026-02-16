class DataflowDiagram {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.container = document.getElementById('canvas-container');

        this.boxes = [];
        this.connections = [];
        this.boxCounter = 0;
        this.connectionCounter = 0;

        this.currentTool = null;
        this.currentBoxType = null;
        this.isDragging = false;
        this.draggedStack = null;
        this.dragOffset = { x: 0, y: 0 };
        this.connectionStart = null; // { box, bumpId }
        this.tempConnection = null;
        this.draggingLineEnd = null; // { conn, end: 'from'|'to', mousePos }

        this.SNAP_THRESHOLD = 20;
        this.BUMP_RADIUS = 6;

        this.contextMenu = null;
        this.contextMenuTarget = null;
        this.contextMenuType = null;

        this.init();
    }

    init() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        this.contextMenu = document.getElementById('context-menu');

        document.getElementById('box-type1-tool').addEventListener('click', () => this.selectTool('box', 1));
        document.getElementById('box-type2-tool').addEventListener('click', () => this.selectTool('box', 2));
        document.getElementById('box-type3-tool').addEventListener('click', () => this.selectTool('box', 3));
        document.getElementById('line-tool').addEventListener('click', () => this.selectTool('line'));
        document.getElementById('json-button').addEventListener('click', () => this.showJSON());
        document.getElementById('close-modal').addEventListener('click', () => this.closeModal());

        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('contextmenu', (e) => this.handleContextMenu(e));

        document.addEventListener('click', (e) => {
            if (!this.contextMenu.contains(e.target)) {
                this.hideContextMenu();
            }
        });

        document.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', (e) => this.handleContextMenuAction(e));
        });

        this.render();
    }

    resizeCanvas() {
        this.canvas.width = this.container.clientWidth;
        this.canvas.height = this.container.clientHeight;
        this.render();
    }

    selectTool(tool, boxType = null) {
        this.currentTool = tool;
        this.currentBoxType = boxType;
        document.querySelectorAll('.tool-item').forEach(item => item.classList.remove('active'));
        if (tool === 'box') {
            document.getElementById(`box-type${boxType}-tool`).classList.add('active');
            this.canvas.style.cursor = 'crosshair';
        } else {
            document.getElementById(`${tool}-tool`).classList.add('active');
            this.canvas.style.cursor = 'default';
        }
    }

    // --- Bump methods ---

    getBumps(box) {
        const bumps = [];
        if (box.type === 1) {
            bumps.push({ id: 'top-left', type: 'top', x: box.x + box.width * 0.3, y: box.y });
            bumps.push({ id: 'top-right', type: 'top', x: box.x + box.width * 0.7, y: box.y });
            bumps.push({ id: 'bottom', type: 'bottom', x: box.x + box.width * 0.5, y: box.y + box.height });
        } else if (box.type === 2) {
            bumps.push({ id: 'top', type: 'top', x: box.x + box.width * 0.5, y: box.y });
            bumps.push({ id: 'bottom', type: 'bottom', x: box.x + box.width * 0.5, y: box.y + box.height });
        } else if (box.type === 3) {
            bumps.push({ id: 'top', type: 'top', x: box.x + box.width * 0.5, y: box.y });
            bumps.push({ id: 'bottom', type: 'bottom', x: box.x + box.width * 0.5, y: box.y + box.height });
            bumps.push({ id: 'right', type: 'right', x: box.x + box.width, y: box.y + box.height * 0.5 });
        }
        return bumps;
    }

    getBumpTipPosition(box, bumpId) {
        const r = this.BUMP_RADIUS;
        switch (bumpId) {
            case 'top-left': return { x: box.x + box.width * 0.3, y: box.y - r };
            case 'top-right': return { x: box.x + box.width * 0.7, y: box.y - r };
            case 'top': return { x: box.x + box.width * 0.5, y: box.y - r };
            case 'bottom': return { x: box.x + box.width * 0.5, y: box.y + box.height + r };
            case 'right': return { x: box.x + box.width + r, y: box.y + box.height * 0.5 };
        }
        return null;
    }

    getBumpType(bumpId) {
        if (bumpId === 'top' || bumpId === 'top-left' || bumpId === 'top-right') return 'top';
        if (bumpId === 'bottom') return 'bottom';
        if (bumpId === 'right') return 'right';
        return null;
    }

    isBumpAvailable(box, bump) {
        if (bump.type === 'top') return !box.parentBox;
        if (bump.type === 'bottom') return !box.childBox;
        if (bump.type === 'right') return true;
        return false;
    }

    getNearestAvailableBump(box, x, y) {
        const bumps = this.getBumps(box);
        let nearest = null;
        let minDist = Infinity;

        for (const bump of bumps) {
            if (!this.isBumpAvailable(box, bump)) continue;
            const dx = x - bump.x;
            const dy = y - bump.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) {
                minDist = dist;
                nearest = bump;
            }
        }

        return nearest;
    }

    hasConnectionOnBumpType(box, bumpType) {
        return this.connections.some(conn => {
            if (conn.from === box.id && this.getBumpType(conn.fromBump) === bumpType) return true;
            if (conn.to === box.id && this.getBumpType(conn.toBump) === bumpType) return true;
            return false;
        });
    }

    // --- Mouse handlers ---

    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (this.currentTool === 'box') {
            this.createBox(x, y, this.currentBoxType);
            this.currentTool = null;
            this.currentBoxType = null;
            document.querySelectorAll('.tool-item').forEach(item => item.classList.remove('active'));
            this.canvas.style.cursor = 'default';
        } else if (this.currentTool === 'line') {
            const box = this.getBoxAt(x, y, this.BUMP_RADIUS);
            if (box) {
                const bump = this.getNearestAvailableBump(box, x, y);
                if (bump) {
                    this.connectionStart = { box, bumpId: bump.id };
                    this.tempConnection = { x, y };
                }
            }
        } else {
            // Check for line endpoint drag before box drag
            const lineEnd = this.getLineEndAt(x, y);
            if (lineEnd) {
                this.draggingLineEnd = {
                    conn: lineEnd.conn,
                    end: lineEnd.end,
                    mousePos: { x, y }
                };
                this.canvas.style.cursor = 'move';
            } else {
                const box = this.getBoxAt(x, y);
                if (box) {
                    this.startDragging(box, x, y);
                }
            }
        }
    }

    startDragging(clickedBox, x, y) {
        this.isDragging = true;

        const stack = this.getStackContaining(clickedBox);
        const clickedIndex = stack.indexOf(clickedBox);

        if (clickedIndex === 0) {
            this.draggedStack = stack;
        } else {
            const upperStack = stack.slice(0, clickedIndex);
            const lowerStack = stack.slice(clickedIndex);

            if (upperStack.length > 0) {
                upperStack[upperStack.length - 1].childBox = null;
            }
            if (lowerStack.length > 0) {
                lowerStack[0].parentBox = null;
            }

            this.draggedStack = lowerStack;
        }

        const topBox = this.draggedStack[0];
        this.dragOffset = {
            x: x - topBox.x,
            y: y - topBox.y
        };

        this.canvas.style.cursor = 'move';
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (this.isDragging && this.draggedStack) {
            const topBox = this.draggedStack[0];
            const newX = x - this.dragOffset.x;
            const newY = y - this.dragOffset.y;
            const deltaX = newX - topBox.x;
            const deltaY = newY - topBox.y;

            this.draggedStack.forEach(box => {
                box.x += deltaX;
                box.y += deltaY;
            });

            this.render();
        } else if (this.draggingLineEnd) {
            this.draggingLineEnd.mousePos = { x, y };
            this.render();
        } else if (this.connectionStart && this.tempConnection) {
            this.tempConnection = { x, y };
            this.render();
        } else if (!this.currentTool) {
            const lineEnd = this.getLineEndAt(x, y);
            if (lineEnd) {
                this.canvas.style.cursor = 'pointer';
            } else {
                const box = this.getBoxAt(x, y);
                this.canvas.style.cursor = box ? 'move' : 'default';
            }
        }
    }

    handleMouseUp(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (this.isDragging && this.draggedStack) {
            this.trySnapping(this.draggedStack);

            this.isDragging = false;
            this.draggedStack = null;
            this.canvas.style.cursor = 'default';
            this.render();
        } else if (this.draggingLineEnd) {
            const { conn, end } = this.draggingLineEnd;
            const endBox = this.getBoxAt(x, y, this.BUMP_RADIUS);

            if (endBox) {
                const otherBoxId = end === 'from' ? conn.to : conn.from;
                if (endBox.id !== otherBoxId) {
                    const bump = this.getNearestAvailableBump(endBox, x, y);
                    if (bump) {
                        if (end === 'from') {
                            conn.from = endBox.id;
                            conn.fromBump = bump.id;
                        } else {
                            conn.to = endBox.id;
                            conn.toBump = bump.id;
                        }
                    }
                }
            }

            this.draggingLineEnd = null;
            this.canvas.style.cursor = 'default';
            this.render();
        } else if (this.connectionStart) {
            const endBox = this.getBoxAt(x, y, this.BUMP_RADIUS);
            if (endBox && endBox !== this.connectionStart.box) {
                const bump = this.getNearestAvailableBump(endBox, x, y);
                if (bump) {
                    this.createConnection(
                        this.connectionStart.box, this.connectionStart.bumpId,
                        endBox, bump.id
                    );
                    this.currentTool = null;
                    document.querySelectorAll('.tool-item').forEach(item => item.classList.remove('active'));
                }
            }
            this.connectionStart = null;
            this.tempConnection = null;
            this.render();
        }
    }

    // --- Stacking ---

    trySnapping(draggedStack) {
        const topBox = draggedStack[0];
        const bottomBox = draggedStack[draggedStack.length - 1];

        // Snap TOP of dragged stack to BOTTOM of another box
        // Only types 2 and 3 have a single top bump that can connect
        if (topBox.type === 2 || topBox.type === 3) {
            if (!this.hasConnectionOnBumpType(topBox, 'top')) {
                for (let box of this.boxes) {
                    if (draggedStack.includes(box)) continue;
                    if (box.childBox) continue;
                    if (this.hasConnectionOnBumpType(box, 'bottom')) continue;

                    const boxBottomY = box.y + box.height;
                    const topBoxTopY = topBox.y;
                    const verticalDist = Math.abs(boxBottomY - topBoxTopY);
                    const horizontalDist = Math.abs((box.x + box.width / 2) - (topBox.x + topBox.width / 2));

                    if (horizontalDist < 30 && verticalDist < this.SNAP_THRESHOLD) {
                        this.snapBoxes(box, topBox);
                        return;
                    }
                }
            }
        }

        // Snap BOTTOM of dragged stack to TOP of another box
        // Only types 2 and 3 can initiate this snap
        if (bottomBox.type === 2 || bottomBox.type === 3) {
            if (!this.hasConnectionOnBumpType(bottomBox, 'bottom')) {
                for (let box of this.boxes) {
                    if (draggedStack.includes(box)) continue;
                    if (box.parentBox) continue;
                    if (box.type === 1) continue; // Type 1 can't be a child (2 top bumps)
                    if (this.hasConnectionOnBumpType(box, 'top')) continue;

                    const bottomBoxBottomY = bottomBox.y + bottomBox.height;
                    const boxTopY = box.y;
                    const verticalDist = Math.abs(bottomBoxBottomY - boxTopY);
                    const horizontalDist = Math.abs((bottomBox.x + bottomBox.width / 2) - (box.x + box.width / 2));

                    if (horizontalDist < 30 && verticalDist < this.SNAP_THRESHOLD) {
                        this.snapBoxes(bottomBox, box);
                        return;
                    }
                }
            }
        }
    }

    snapBoxes(parentBox, childBox) {
        parentBox.childBox = childBox;
        childBox.parentBox = parentBox;

        const oldChildX = childBox.x;
        childBox.x = parentBox.x + (parentBox.width - childBox.width) / 2;
        childBox.y = parentBox.y + parentBox.height;

        const deltaX = childBox.x - oldChildX;
        this.updateDescendants(childBox, deltaX);
    }

    updateDescendants(box, deltaX) {
        let current = box.childBox;
        while (current) {
            current.x += deltaX;
            current.y = current.parentBox.y + current.parentBox.height;
            current = current.childBox;
        }
    }

    getStackContaining(box) {
        let topBox = box;
        while (topBox.parentBox) {
            topBox = topBox.parentBox;
        }

        const stack = [topBox];
        let current = topBox;
        while (current.childBox) {
            stack.push(current.childBox);
            current = current.childBox;
        }

        return stack;
    }

    // --- Box/Connection CRUD ---

    createBox(x, y, type) {
        const box = {
            id: `B${this.boxCounter++}`,
            x: x - 50,
            y: y - 30,
            width: 100,
            height: 60,
            type: type,
            parentBox: null,
            childBox: null
        };
        this.boxes.push(box);
        this.render();
    }

    createConnection(fromBox, fromBumpId, toBox, toBumpId) {
        const connection = {
            id: `L${this.connectionCounter++}`,
            from: fromBox.id,
            fromBump: fromBumpId,
            to: toBox.id,
            toBump: toBumpId
        };
        this.connections.push(connection);
        this.render();
    }

    getBoxAt(x, y, margin = 0) {
        for (let i = this.boxes.length - 1; i >= 0; i--) {
            const box = this.boxes[i];
            if (x >= box.x - margin && x <= box.x + box.width + margin &&
                y >= box.y - margin && y <= box.y + box.height + margin) {
                return box;
            }
        }
        return null;
    }

    getBoxById(id) {
        return this.boxes.find(box => box.id === id);
    }

    // --- Rendering ---

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw connections
        this.connections.forEach(conn => {
            const fromBox = this.getBoxById(conn.from);
            const toBox = this.getBoxById(conn.to);
            if (fromBox && toBox) {
                if (this.draggingLineEnd && this.draggingLineEnd.conn === conn) {
                    const { end, mousePos } = this.draggingLineEnd;
                    if (end === 'from') {
                        const toPos = this.getBumpTipPosition(toBox, conn.toBump);
                        if (toPos) {
                            this.drawLine(mousePos.x, mousePos.y, toPos.x, toPos.y, conn.id, false);
                        }
                    } else {
                        const fromPos = this.getBumpTipPosition(fromBox, conn.fromBump);
                        if (fromPos) {
                            this.drawLine(fromPos.x, fromPos.y, mousePos.x, mousePos.y, conn.id, false);
                        }
                    }
                } else {
                    this.drawConnection(conn, fromBox, toBox);
                }
            }
        });

        // Draw temporary connection
        if (this.connectionStart && this.tempConnection) {
            const tipPos = this.getBumpTipPosition(this.connectionStart.box, this.connectionStart.bumpId);
            if (tipPos) {
                this.drawLine(tipPos.x, tipPos.y, this.tempConnection.x, this.tempConnection.y, null, true);
            }
        }

        // Draw boxes
        this.boxes.forEach(box => {
            this.drawBox(box);
        });
    }

    drawBox(box) {
        this.ctx.strokeStyle = '#000';
        this.ctx.fillStyle = '#fff';
        this.ctx.lineWidth = 2;

        this.ctx.fillRect(box.x, box.y, box.width, box.height);
        this.ctx.strokeRect(box.x, box.y, box.width, box.height);

        if (box.type === 1) {
            this.drawBump(box.x + box.width * 0.3, box.y, 'top');
            this.drawBump(box.x + box.width * 0.7, box.y, 'top');
            this.drawBump(box.x + box.width * 0.5, box.y + box.height, 'bottom');
        } else if (box.type === 2) {
            this.drawBump(box.x + box.width * 0.5, box.y, 'top');
            this.drawBump(box.x + box.width * 0.5, box.y + box.height, 'bottom');
        } else if (box.type === 3) {
            this.drawBump(box.x + box.width * 0.5, box.y, 'top');
            this.drawBump(box.x + box.width * 0.5, box.y + box.height, 'bottom');
            this.drawBump(box.x + box.width, box.y + box.height * 0.5, 'right');
        }

        this.ctx.fillStyle = '#000';
        this.ctx.font = '14px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(box.id, box.x + box.width / 2, box.y + box.height / 2);
    }

    drawBump(x, y, direction) {
        const radius = this.BUMP_RADIUS;

        this.ctx.fillStyle = '#fff';
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 2;

        this.ctx.beginPath();
        if (direction === 'top') {
            this.ctx.arc(x, y, radius, Math.PI, 0, false);
        } else if (direction === 'bottom') {
            this.ctx.arc(x, y, radius, 0, Math.PI, false);
        } else if (direction === 'right') {
            this.ctx.arc(x, y, radius, -Math.PI / 2, Math.PI / 2, false);
        }
        this.ctx.fill();
        this.ctx.stroke();
    }

    drawConnection(conn, fromBox, toBox) {
        const fromPos = this.getBumpTipPosition(fromBox, conn.fromBump);
        const toPos = this.getBumpTipPosition(toBox, conn.toBump);

        if (fromPos && toPos) {
            this.drawLine(fromPos.x, fromPos.y, toPos.x, toPos.y, conn.id, false);
        }
    }

    drawLine(x1, y1, x2, y2, label, isTemp) {
        this.ctx.strokeStyle = '#000';
        this.ctx.fillStyle = '#000';
        this.ctx.lineWidth = 2;

        const angle = Math.atan2(y2 - y1, x2 - x1);

        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();

        // Draw tail circle
        this.ctx.beginPath();
        this.ctx.arc(x1, y1, 5, 0, Math.PI * 2);
        this.ctx.fillStyle = '#fff';
        this.ctx.fill();
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // Draw arrowhead
        const arrowSize = 12;
        this.ctx.beginPath();
        this.ctx.moveTo(x2, y2);
        this.ctx.lineTo(
            x2 - arrowSize * Math.cos(angle - Math.PI / 6),
            y2 - arrowSize * Math.sin(angle - Math.PI / 6)
        );
        this.ctx.lineTo(
            x2 - arrowSize * Math.cos(angle + Math.PI / 6),
            y2 - arrowSize * Math.sin(angle + Math.PI / 6)
        );
        this.ctx.closePath();
        this.ctx.fillStyle = '#000';
        this.ctx.fill();

        if (label && !isTemp) {
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;

            this.ctx.font = '12px sans-serif';
            const textMetrics = this.ctx.measureText(label);
            const textWidth = textMetrics.width;
            const padding = 4;

            this.ctx.fillStyle = '#fff';
            this.ctx.fillRect(
                midX - textWidth / 2 - padding,
                midY - 8,
                textWidth + padding * 2,
                16
            );

            this.ctx.fillStyle = '#000';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(label, midX, midY);
        }
    }

    // --- Context menu ---

    handleContextMenu(e) {
        e.preventDefault();

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const connection = this.getConnectionAt(x, y);
        if (connection) {
            this.showContextMenuForLine(connection, e.clientX, e.clientY);
            return;
        }

        const box = this.getBoxAt(x, y);
        if (box) {
            this.showContextMenuForBox(box, e.clientX, e.clientY);
            return;
        }

        this.hideContextMenu();
    }

    showContextMenuForLine(connection, x, y) {
        this.contextMenuTarget = connection;
        this.contextMenuType = 'line';

        document.querySelectorAll('.context-menu-item').forEach(item => {
            item.style.display = 'none';
        });
        document.querySelector('[data-action="delete"]').style.display = 'block';
        document.querySelector('[data-action="delete"]').textContent = 'Delete line';

        this.contextMenu.style.left = x + 'px';
        this.contextMenu.style.top = y + 'px';
        this.contextMenu.style.display = 'block';
    }

    showContextMenuForBox(box, x, y) {
        this.contextMenuTarget = box;
        this.contextMenuType = 'box';

        const stack = this.getStackContaining(box);
        const isInStack = stack.length > 1;

        document.querySelectorAll('.context-menu-item').forEach(item => {
            item.style.display = 'none';
        });

        if (!isInStack) {
            document.querySelector('[data-action="delete"]').style.display = 'block';
            document.querySelector('[data-action="delete"]').textContent = 'Delete box';
        } else {
            document.querySelector('[data-action="delete-box"]').style.display = 'block';
            document.querySelector('[data-action="delete-box-and-below"]').style.display = 'block';
        }

        this.contextMenu.style.left = x + 'px';
        this.contextMenu.style.top = y + 'px';
        this.contextMenu.style.display = 'block';
    }

    hideContextMenu() {
        this.contextMenu.style.display = 'none';
        this.contextMenuTarget = null;
        this.contextMenuType = null;
    }

    handleContextMenuAction(e) {
        const action = e.target.getAttribute('data-action');

        if (this.contextMenuType === 'line' && action === 'delete') {
            this.deleteLine(this.contextMenuTarget);
        } else if (this.contextMenuType === 'box' && action === 'delete') {
            this.deleteBox(this.contextMenuTarget, false);
        } else if (this.contextMenuType === 'box' && action === 'delete-box') {
            this.deleteBox(this.contextMenuTarget, false);
        } else if (this.contextMenuType === 'box' && action === 'delete-box-and-below') {
            this.deleteBox(this.contextMenuTarget, true);
        }

        this.hideContextMenu();
        this.render();
    }

    deleteLine(connection) {
        const index = this.connections.indexOf(connection);
        if (index > -1) {
            this.connections.splice(index, 1);
        }
    }

    deleteBox(box, deleteBelow) {
        if (deleteBelow) {
            const boxesToDelete = [box];
            let current = box.childBox;
            while (current) {
                boxesToDelete.push(current);
                current = current.childBox;
            }

            if (box.parentBox) {
                box.parentBox.childBox = null;
            }

            boxesToDelete.forEach(b => {
                const boxIndex = this.boxes.indexOf(b);
                if (boxIndex > -1) {
                    this.boxes.splice(boxIndex, 1);
                }

                this.connections = this.connections.filter(
                    conn => conn.from !== b.id && conn.to !== b.id
                );
            });
        } else {
            if (box.parentBox && box.childBox) {
                box.parentBox.childBox = box.childBox;
                box.childBox.parentBox = box.parentBox;

                box.childBox.x = box.parentBox.x + (box.parentBox.width - box.childBox.width) / 2;
                box.childBox.y = box.parentBox.y + box.parentBox.height;

                const deltaX = box.childBox.x - box.x;
                this.updateDescendants(box.childBox, deltaX);
            } else {
                if (box.parentBox) {
                    box.parentBox.childBox = null;
                }
                if (box.childBox) {
                    box.childBox.parentBox = null;
                }
            }

            const boxIndex = this.boxes.indexOf(box);
            if (boxIndex > -1) {
                this.boxes.splice(boxIndex, 1);
            }

            this.connections = this.connections.filter(
                conn => conn.from !== box.id && conn.to !== box.id
            );
        }
    }

    // --- Hit testing ---

    getLineEndAt(x, y) {
        const threshold = 12;

        for (let conn of this.connections) {
            const fromBox = this.getBoxById(conn.from);
            const toBox = this.getBoxById(conn.to);
            if (!fromBox || !toBox) continue;

            const fromPos = this.getBumpTipPosition(fromBox, conn.fromBump);
            const toPos = this.getBumpTipPosition(toBox, conn.toBump);
            if (!fromPos || !toPos) continue;

            const fromDist = Math.sqrt((x - fromPos.x) ** 2 + (y - fromPos.y) ** 2);
            if (fromDist < threshold) {
                return { conn, end: 'from' };
            }

            const toDist = Math.sqrt((x - toPos.x) ** 2 + (y - toPos.y) ** 2);
            if (toDist < threshold) {
                return { conn, end: 'to' };
            }
        }

        return null;
    }

    getConnectionAt(x, y) {
        const threshold = 8;

        for (let conn of this.connections) {
            const fromBox = this.getBoxById(conn.from);
            const toBox = this.getBoxById(conn.to);

            if (!fromBox || !toBox) continue;

            const fromPos = this.getBumpTipPosition(fromBox, conn.fromBump);
            const toPos = this.getBumpTipPosition(toBox, conn.toBump);

            if (!fromPos || !toPos) continue;

            const dist = this.pointToLineDistance(x, y, fromPos.x, fromPos.y, toPos.x, toPos.y);

            if (dist < threshold) {
                return conn;
            }
        }

        return null;
    }

    pointToLineDistance(px, py, x1, y1, x2, y2) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;

        if (lenSq !== 0) {
            param = dot / lenSq;
        }

        let xx, yy;

        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        const dx = px - xx;
        const dy = py - yy;

        return Math.sqrt(dx * dx + dy * dy);
    }

    // --- JSON ---

    showJSON() {
        const data = {
            boxes: this.boxes.map(box => ({
                id: box.id,
                x: box.x,
                y: box.y,
                width: box.width,
                height: box.height,
                type: box.type,
                parentBox: box.parentBox ? box.parentBox.id : null,
                childBox: box.childBox ? box.childBox.id : null
            })),
            connections: this.connections.map(conn => ({
                id: conn.id,
                from: conn.from,
                fromBump: conn.fromBump,
                to: conn.to,
                toBump: conn.toBump
            }))
        };

        document.getElementById('json-output').textContent = JSON.stringify(data, null, 2);
        document.getElementById('modal').classList.add('show');
    }

    closeModal() {
        document.getElementById('modal').classList.remove('show');
    }
}

// Initialize the diagram when the page loads
new DataflowDiagram();
