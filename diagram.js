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
        this.connectionStart = null;
        this.tempConnection = null;
        
        this.SNAP_THRESHOLD = 20; // Distance threshold for snapping
        
        this.init();
    }
    
    init() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        document.getElementById('box-type1-tool').addEventListener('click', () => this.selectTool('box', 1));
        document.getElementById('box-type2-tool').addEventListener('click', () => this.selectTool('box', 2));
        document.getElementById('line-tool').addEventListener('click', () => this.selectTool('line'));
        document.getElementById('json-button').addEventListener('click', () => this.showJSON());
        document.getElementById('close-modal').addEventListener('click', () => this.closeModal());
        
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        
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
            const box = this.getBoxAt(x, y);
            if (box) {
                this.connectionStart = box;
                this.tempConnection = { x, y };
            }
        } else {
            const box = this.getBoxAt(x, y);
            if (box) {
                // Determine which part of the stack to drag
                this.startDragging(box, x, y);
            }
        }
    }
    
    startDragging(clickedBox, x, y) {
        this.isDragging = true;
        
        // Find the stack this box belongs to
        const stack = this.getStackContaining(clickedBox);
        const clickedIndex = stack.indexOf(clickedBox);
        
        // If clicked on top box, drag entire stack
        // Otherwise, separate the stack and drag from clicked box down
        if (clickedIndex === 0) {
            // Drag entire stack
            this.draggedStack = stack;
        } else {
            // Separate stack at clicked box
            const upperStack = stack.slice(0, clickedIndex);
            const lowerStack = stack.slice(clickedIndex);
            
            // Detach the lower stack
            if (upperStack.length > 0) {
                const topOfUpper = upperStack[upperStack.length - 1];
                topOfUpper.childBox = null;
            }
            if (lowerStack.length > 0) {
                lowerStack[0].parentBox = null;
            }
            
            this.draggedStack = lowerStack;
        }
        
        // Calculate offset from the top box of the dragged stack
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
            
            // Move entire stack
            this.draggedStack.forEach(box => {
                box.x += deltaX;
                box.y += deltaY;
            });
            
            this.render();
        } else if (this.connectionStart && this.tempConnection) {
            this.tempConnection = { x, y };
            this.render();
        } else if (!this.currentTool) {
            const box = this.getBoxAt(x, y);
            this.canvas.style.cursor = box ? 'move' : 'default';
        }
    }
    
    handleMouseUp(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (this.isDragging && this.draggedStack) {
            // Try to snap to another box
            this.trySnapping(this.draggedStack);
            
            this.isDragging = false;
            this.draggedStack = null;
            this.canvas.style.cursor = 'default';
            this.render();
        } else if (this.connectionStart) {
            const endBox = this.getBoxAt(x, y);
            if (endBox && endBox !== this.connectionStart) {
                this.createConnection(this.connectionStart, endBox);
                this.currentTool = null;
                document.querySelectorAll('.tool-item').forEach(item => item.classList.remove('active'));
            }
            this.connectionStart = null;
            this.tempConnection = null;
            this.render();
        }
    }
    
    trySnapping(draggedStack) {
        const topBox = draggedStack[0];
        const bottomBox = draggedStack[draggedStack.length - 1];
        
        // Check if we can snap the TOP of draggedStack to BOTTOM of another box
        // Only Type 2 can connect its top to another box's bottom
        // Type 1 (2 bumps on top) CANNOT connect its top to another box's bottom
        if (topBox.type === 2) { // Only Type 2 can connect its top to another's bottom
            for (let box of this.boxes) {
                if (draggedStack.includes(box)) continue;
                if (box.childBox) continue; // Already has a child
                
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
        
        // Check if we can snap the BOTTOM of draggedStack to TOP of another box
        // Only Type 2 can connect its bottom to another box's top
        if (bottomBox.type === 2) { // Only Type 2 has 1 bump on bottom that can connect
            for (let box of this.boxes) {
                if (draggedStack.includes(box)) continue;
                if (box.parentBox) continue; // Already has a parent
                
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
    
    snapBoxes(parentBox, childBox) {
        // parentBox's bottom connects to childBox's top
        parentBox.childBox = childBox;
        childBox.parentBox = parentBox;
        
        // Align child box below parent
        childBox.x = parentBox.x + (parentBox.width - childBox.width) / 2;
        childBox.y = parentBox.y + parentBox.height;
    }
    
    getStackContaining(box) {
        // Find the top of the stack
        let topBox = box;
        while (topBox.parentBox) {
            topBox = topBox.parentBox;
        }
        
        // Build stack from top to bottom
        const stack = [topBox];
        let current = topBox;
        while (current.childBox) {
            stack.push(current.childBox);
            current = current.childBox;
        }
        
        return stack;
    }
    
    createBox(x, y, type) {
        const box = {
            id: `B${this.boxCounter++}`,
            x: x - 50,
            y: y - 30,
            width: 100,
            height: 60,
            type: type, // 1 or 2
            parentBox: null,
            childBox: null
        };
        this.boxes.push(box);
        this.render();
    }
    
    createConnection(from, to) {
        const connection = {
            id: `L${this.connectionCounter++}`,
            from: from.id,
            to: to.id
        };
        this.connections.push(connection);
        this.render();
    }
    
    getBoxAt(x, y) {
        for (let i = this.boxes.length - 1; i >= 0; i--) {
            const box = this.boxes[i];
            if (x >= box.x && x <= box.x + box.width &&
                y >= box.y && y <= box.y + box.height) {
                return box;
            }
        }
        return null;
    }
    
    getBoxById(id) {
        return this.boxes.find(box => box.id === id);
    }
    
    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw connections
        this.connections.forEach(conn => {
            const fromBox = this.getBoxById(conn.from);
            const toBox = this.getBoxById(conn.to);
            if (fromBox && toBox) {
                this.drawConnection(fromBox, toBox, conn.id);
            }
        });
        
        // Draw temporary connection
        if (this.connectionStart && this.tempConnection) {
            const startX = this.connectionStart.x + this.connectionStart.width / 2;
            const startY = this.connectionStart.y + this.connectionStart.height / 2;
            this.drawLine(startX, startY, this.tempConnection.x, this.tempConnection.y, null, true);
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
        
        // Draw main box rectangle
        this.ctx.fillRect(box.x, box.y, box.width, box.height);
        this.ctx.strokeRect(box.x, box.y, box.width, box.height);
        
        // Draw bumps based on type
        if (box.type === 1) {
            // 2 bumps on top, 1 on bottom
            this.drawBump(box.x + box.width * 0.3, box.y, true);
            this.drawBump(box.x + box.width * 0.7, box.y, true);
            this.drawBump(box.x + box.width * 0.5, box.y + box.height, false);
        } else if (box.type === 2) {
            // 1 bump on top, 1 on bottom
            this.drawBump(box.x + box.width * 0.5, box.y, true);
            this.drawBump(box.x + box.width * 0.5, box.y + box.height, false);
        }
        
        // Draw label
        this.ctx.fillStyle = '#000';
        this.ctx.font = '14px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(box.id, box.x + box.width / 2, box.y + box.height / 2);
    }
    
    drawBump(x, y, isTop) {
        const radius = 6;
        
        this.ctx.fillStyle = '#fff';
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 2;
        
        this.ctx.beginPath();
        if (isTop) {
            // Semicircle on top
            this.ctx.arc(x, y, radius, Math.PI, 0, false);
        } else {
            // Semicircle on bottom
            this.ctx.arc(x, y, radius, 0, Math.PI, false);
        }
        this.ctx.fill();
        this.ctx.stroke();
    }
    
    drawConnection(fromBox, toBox, label) {
        // Calculate centers
        const fromCenterX = fromBox.x + fromBox.width / 2;
        const fromCenterY = fromBox.y + fromBox.height / 2;
        const toCenterX = toBox.x + toBox.width / 2;
        const toCenterY = toBox.y + toBox.height / 2;
        
        // Calculate intersection points with box edges
        const startPoint = this.getBoxEdgeIntersection(fromBox, fromCenterX, fromCenterY, toCenterX, toCenterY);
        const endPoint = this.getBoxEdgeIntersection(toBox, toCenterX, toCenterY, fromCenterX, fromCenterY);
        
        this.drawLine(startPoint.x, startPoint.y, endPoint.x, endPoint.y, label, false);
    }
    
    getBoxEdgeIntersection(box, centerX, centerY, targetX, targetY) {
        // Calculate the angle from box center to target
        const dx = targetX - centerX;
        const dy = targetY - centerY;
        
        // Calculate intersections with all four edges
        const halfWidth = box.width / 2;
        const halfHeight = box.height / 2;
        
        let intersectX, intersectY;
        
        // Check which edge to intersect with
        if (Math.abs(dx) / halfWidth > Math.abs(dy) / halfHeight) {
            // Intersects with left or right edge
            if (dx > 0) {
                // Right edge
                intersectX = centerX + halfWidth;
                intersectY = centerY + (halfWidth * dy / dx);
            } else {
                // Left edge
                intersectX = centerX - halfWidth;
                intersectY = centerY - (halfWidth * dy / dx);
            }
        } else {
            // Intersects with top or bottom edge
            if (dy > 0) {
                // Bottom edge
                intersectX = centerX + (halfHeight * dx / dy);
                intersectY = centerY + halfHeight;
            } else {
                // Top edge
                intersectX = centerX - (halfHeight * dx / dy);
                intersectY = centerY - halfHeight;
            }
        }
        
        return { x: intersectX, y: intersectY };
    }
    
    drawLine(x1, y1, x2, y2, label, isTemp) {
        this.ctx.strokeStyle = '#000';
        this.ctx.fillStyle = '#000';
        this.ctx.lineWidth = 2;
        
        // Calculate angle for arrow
        const angle = Math.atan2(y2 - y1, x2 - x1);
        
        // Draw the main line
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
        
        // Draw tail circle (small filled circle at the start)
        this.ctx.beginPath();
        this.ctx.arc(x1, y1, 5, 0, Math.PI * 2);
        this.ctx.fillStyle = '#fff';
        this.ctx.fill();
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        
        // Draw head triangle (arrowhead at the end)
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
        
        // Draw label on the line (only for permanent connections)
        if (label && !isTemp) {
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            
            // Draw white background for label
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
            
            // Draw label text
            this.ctx.fillStyle = '#000';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(label, midX, midY);
        }
    }
    
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
                to: conn.to
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
