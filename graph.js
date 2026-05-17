let graph;
let entitiesData = null;
let relationshipsData = null;

let nodes = null;
let links = null;

const linkDefaultDistance = 30;
const chargeDefaultStrength = -80;
const linkHighlightDistance = 120;
const chargeHighlightStrength = -200;
const linkDefaultWidth = 1;

let colors = null;
let lightDarkMode = null;
let clusterMode = null;
let clustersCalculated = false;

let selectedNode = null;
let selectedLink = null;
let highlightedNodes = new Set();
let highlightedLinks = new Set();

// Selection mode variables
let selectionMode = false;
let isSelecting = false;
let selectionStart = null;
let selectionBox = null;

document.addEventListener('DOMContentLoaded', function() {
    lightDarkMode = localStorage.getItem('colorMode') || 'dark';
    if (lightDarkMode === 'dark') {
        document.body.classList.add('dark-mode');
    }

    colors = getCurrentColors();
    clusterMode = localStorage.getItem('clusterColorMode') || 'enabled';

    initializeGraph();
    
    // Auto-load data from JSON files
    Promise.all([
        fetch('entities.json').then(r => r.json()),
        fetch('relationships.json').then(r => r.json())
    ]).then(([entities, relationships]) => {
        entitiesData = entities;
        relationshipsData = relationships;
        document.getElementById('entities-file-name').textContent = 'entities.json (auto-loaded)';
        document.getElementById('relationships-file-name').textContent = 'relationships.json (auto-loaded)';
        generateGraph();
    }).catch(err => {
        console.error('Failed to auto-load data:', err);
        // Fallback: keep file upload UI working
    });
    
    const entitiesFile = document.getElementById('entities-file');
    const relationshipsFile = document.getElementById('relationships-file');
    const generateButton = document.getElementById('generate-button');

    entitiesFile.addEventListener('change', (event) => handleFileUpload(event, 'entities'));
    relationshipsFile.addEventListener('change', (event) => handleFileUpload(event, 'relationships'));
    generateButton.addEventListener('click', generateGraph);

    document.getElementById('zoom-fit').onclick = zoomToFit;
    document.getElementById('center-graph').onclick = centerGraph;
    document.getElementById('reset-graph').onclick = resetGraph;
    document.getElementById('toggle-mode').onclick = toggleDarkMode;
    document.getElementById('color-by-cluster').onclick = toggleColorByCluster;
    document.getElementById('subgraph-selector').onclick = toggleSelectionMode;
    
    // Sidebar toggle binding
    const sidebarToggle = document.getElementById('sidebar-toggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', toggleSidebar);
    }
});

function drawNodeWithLabel(node, ctx, globalScale) {
    const nodeRadius = 8;
    ctx.beginPath();
    ctx.arc(node.x, node.y, nodeRadius, 0, 2 * Math.PI, false);
    
    const clusterModeOn = clusterMode === 'enabled';
    let nodeColor;
    if (clusterModeOn) {
        const clusterId = node.clusterId || 0;
        nodeColor = colors.clusterColors[clusterId % colors.clusterColors.length];
    } else {
        nodeColor = colors.nodeColor;
    }
    
    ctx.fillStyle = nodeColor;
    ctx.fill();

    // Add outline for selected or highlighted nodes
    if (selectedNode && selectedNode.id === node.id) {
        ctx.strokeStyle = colors.nodeSelected;
        ctx.lineWidth = 3;
        ctx.stroke();
    } else if (highlightedNodes.has(node.id)) {
        ctx.strokeStyle = colors.nodeHighlighted;
        ctx.lineWidth = 3;
        ctx.stroke();
    }

    const label = node.name;
    const fontSize = Math.max(8, nodeRadius * 0.3);
    ctx.font = `${fontSize}px Sans-Serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = colors.textColor;
    ctx.fillText(label, node.x, node.y + nodeRadius + fontSize * 0.7);
}

function initializeGraph() {
    const graphContainer = document.getElementById('graph-container');
    console.log('Initializing ForceGraph...', { ForceGraph: typeof ForceGraph, container: graphContainer });
    
    try {
        graph = ForceGraph()(graphContainer)
            .width(graphContainer.clientWidth)
            .height(graphContainer.clientHeight)
            .backgroundColor('transparent')
            .nodeCanvasObject(drawNodeWithLabel)
            .linkWidth(linkDefaultWidth)
            .linkColor(link => {
                if (selectedLink && selectedLink.id === link.id) {
                    return colors.linkSelected;
                } else if (highlightedLinks.has(link.id)) {
                    return colors.linkHighlighted;
                } else {
                    return colors.linkColor;
                }
            })
            .linkDirectionalArrowLength(6)
            .linkDirectionalArrowRelPos(1)
            .linkCurvature(0.1)
            .onNodeClick(onNodeClick)
            .onLinkClick(onLinkClick)
            .onBackgroundClick(onBackgroundClick)
            .d3Force('x', d3.forceX(0).strength(0.05))
            .d3Force('y', d3.forceY(0).strength(0.05))
            .d3Force("link", d3.forceLink().id(d => d.id).distance(linkDefaultDistance))
            .d3Force("charge", d3.forceManyBody().strength(chargeDefaultStrength));
            
        
    } catch (error) {
        console.error('Error initializing graph:', error);
        alert('初始化图谱失败: ' + error.message);
        return;
    }

    window.addEventListener('resize', () => {
        graph.width(graphContainer.clientWidth)
            .height(graphContainer.clientHeight);
    });
}

function handleFileUpload(event, fileType) {
    const file = event.target.files[0];
    const fileNameSpan = document.getElementById(`${fileType}-file-name`);
    
    if (!file) {
        fileNameSpan.textContent = 'No file chosen';
        if (fileType === 'entities') {
            entitiesData = null;
        } else {
            relationshipsData = null;
        }
        return;
    }

    fileNameSpan.textContent = file.name;
    readFile(file, (data) => {
        try {
            const parsedData = JSON.parse(data);
            if (fileType === 'entities') {
                entitiesData = parsedData;
            } else {
                relationshipsData = parsedData;
            }
            console.log(`${fileType} loaded:`, parsedData);
        } catch (error) {
            console.error(`Error parsing ${fileType} file:`, error);
            alert(`解析 ${fileType} 文件出错，请确认是有效的 JSON 格式。`);
        }
    });
}

function readFile(file, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
        callback(e.target.result);
    };
    reader.onerror = function() {
        console.error('Error reading file:', file.name);
        alert('读取文件出错: ' + file.name);
    };
    reader.readAsText(file);
}

function processEntities(entitiesData) {
    return entitiesData.map(entity => ({
        id: entity.id,
        name: entity.name,
        attributes: entity.attributes,
        entity_type: entity.entity_type || null,
        topic_name: entity.topic_name || null,
        created_at: entity.created_at,
        updated_at: entity.updated_at,
    }));
}

function processRelationships(relationshipsData) {
    return relationshipsData.map(relationship => ({
        id: relationship.id,
        description: relationship.relationship_desc,
        meta: relationship.meta || null,
        weight: relationship.weight || null,
        source: relationship.source_entity_id,
        target: relationship.target_entity_id,
        created_at: relationship.created_at,
        updated_at: relationship.updated_at,
        document_id: relationship.document_id || null,
        chunk_id: relationship.chunk_id || null,
    }));
}

function generateGraph() {
    if (!entitiesData || !relationshipsData) {
        alert('请同时上传实体文件和关系文件');
        return;
    }

    try {
        
        nodes = processEntities(entitiesData);
        links = processRelationships(relationshipsData);
        
        const nodeIds = new Set(nodes.map(node => node.id));
        const validLinks = links.filter(link => {
            const sourceExists = nodeIds.has(link.source);
            const targetExists = nodeIds.has(link.target);
            
            if (!sourceExists || !targetExists) {
                console.warn('Invalid link found:', link, 'Source exists:', sourceExists, 'Target exists:', targetExists);
            }
            
            return sourceExists && targetExists;
        });
        
        const graphData = {
            nodes: nodes,
            links: validLinks
        };
        
        console.log('Generated graph data:', graphData);
        console.log(`Nodes: ${nodes.length}, Valid Links: ${validLinks.length}, Invalid Links: ${links.length - validLinks.length}`);
        
        calculateAndCacheClusters();
        graph.graphData(graphData);
        
        setTimeout(() => {
            graph.zoomToFit(400, 50);
        }, 1000);
        
    } catch (error) {
        console.error('Error generating graph:', error);
        alert('生成图谱出错，请检查控制台详情。');
    }
}

function onNodeClick(node, event) {
    selectedNode = node;
    selectedLink = null; // Clear selected link when selecting a node
    
    showDetails('节点详情', {
        'ID': node.id,
        '名称': node.name,
        '类型': node.entity_type,
        '主题': node.topic_name,
        '属性': node.attributes ? JSON.stringify(node.attributes, null, 2) : '无',
        '创建时间': node.created_at,
        '更新时间': node.updated_at
    });
    
    highlightConnections(node);
}

function onLinkClick(link, event) {
    selectedLink = link;
    selectedNode = null; // Clear selected node when selecting a link
    
    showDetails('连线详情', {
        'ID': link.id,
        '描述': link.description,
        '权重': link.weight,
        '起点': typeof link.source === 'object' ? link.source.id : link.source,
        '终点': typeof link.target === 'object' ? link.target.id : link.target,
        '元数据': link.meta,
        '文档ID': link.document_id,
        '片段ID': link.chunk_id,
        '创建时间': link.created_at,
        '更新时间': link.updated_at
    });
    highlightLink(link);
}

function onBackgroundClick() {
    if (selectionMode) {
        return; // Don't clear highlights in selection mode
    }
    hideDetailsSection();
    clearHighlight();
}

function highlightLink(link) {
    highlightedLinks.clear();
    highlightedLinks.add(link.id);
    updateHighlightPanel();
}

function highlightConnections(node) {
    const connectedNodeIds = new Set();
    const connectedLinkIds = new Set();
    
    graph.graphData().links.forEach(link => {
        if (link.source.id === node.id) {
            connectedNodeIds.add(link.target.id);
            connectedLinkIds.add(link.id);
        } else if (link.target.id === node.id) {
            connectedNodeIds.add(link.source.id);
            connectedLinkIds.add(link.id);
        }
    });
    
    // Update highlighted nodes set to include only connected nodes (not the selected node)
    highlightedNodes.clear();
    connectedNodeIds.forEach(nodeId => highlightedNodes.add(nodeId));
    
    // Update highlighted links set to include connected links
    highlightedLinks.clear();
    connectedLinkIds.forEach(linkId => highlightedLinks.add(linkId));
    
    graph.d3Force("link").distance(link => {
        if (connectedLinkIds.has(link.id)) {
            return linkHighlightDistance;
        }
        return linkDefaultDistance;
    });

    graph.d3Force("charge").strength(node => {
        if (connectedNodeIds.has(node.id)) {
            return chargeHighlightStrength;
        }
        return chargeDefaultStrength;
    });

    graph.d3ReheatSimulation();
    updateHighlightPanel();
}

function clearHighlight() {
    selectedNode = null;
    selectedLink = null;
    highlightedNodes.clear();
    highlightedLinks.clear();
    graph.d3Force("link").distance(linkDefaultDistance);
    graph.d3Force("charge").strength(chargeDefaultStrength);
    hideDetailsSection();
    hideHighlightPanel();
    graph.d3ReheatSimulation();
}

function showDetails(title, details) {
    const detailsSection = document.getElementById('details-section');
    const detailsTitle = document.getElementById('details-title');
    const detailsContent = document.getElementById('details-content');
    
    detailsTitle.textContent = title;
    
    let html = '';
    for (const [key, value] of Object.entries(details)) {
        html += `<p><strong>${key}:</strong><br/>${value || '无'}</p>`;
    }
    
    detailsContent.innerHTML = html;
    detailsSection.style.display = 'block';
    
    // Make sure the highlight panel is visible
    showHighlightPanel();
}

function hideDetailsSection() {
    const detailsSection = document.getElementById('details-section');
    detailsSection.style.display = 'none';
}


function centerGraph() {
    graph.centerAt(0, 0, 1000);
}

function zoomToFit() {
    graph.zoomToFit(400, 50);
}

function resetGraph() {
    if (entitiesData && relationshipsData) {
        generateGraph();
    }
}

function toggleDarkMode() {
    newMode = lightDarkMode === 'dark' ? 'light' : 'dark';
    localStorage.setItem('colorMode', newMode);
    lightDarkMode = newMode;
    document.body.classList.toggle('dark-mode');
    colors = getCurrentColors();
    graph.nodeColor(colors.nodeColor); //temporary fix
}

function getCurrentColors() {
    const computedStyles = getComputedStyle(document.body);
    return {
        textColor: computedStyles.getPropertyValue('--text-color').trim(),
        nodeColor: computedStyles.getPropertyValue('--node-default').trim(),
        nodeHighlighted: computedStyles.getPropertyValue('--node-highlighted').trim(),
        nodeSelected: computedStyles.getPropertyValue('--node-selected').trim(),
        linkColor: computedStyles.getPropertyValue('--link-default').trim(),
        linkHighlighted: computedStyles.getPropertyValue('--link-highlighted').trim(),
        linkSelected: computedStyles.getPropertyValue('--link-selected').trim(),
        clusterColors: [
            computedStyles.getPropertyValue('--cluster-color-0'),
            computedStyles.getPropertyValue('--cluster-color-1'),
            computedStyles.getPropertyValue('--cluster-color-2'),
            computedStyles.getPropertyValue('--cluster-color-3'),
            computedStyles.getPropertyValue('--cluster-color-4'),
            computedStyles.getPropertyValue('--cluster-color-5'),
            computedStyles.getPropertyValue('--cluster-color-6'),
            computedStyles.getPropertyValue('--cluster-color-7'),
            computedStyles.getPropertyValue('--cluster-color-8'),
            computedStyles.getPropertyValue('--cluster-color-9')
        ]
    };
}

function toggleColorByCluster() {
    if (!graph || !clustersCalculated) {
        return;
    }
    newMode = clusterMode === 'enabled' ? 'disabled' : 'enabled';
    localStorage.setItem('clusterColorMode', newMode);
    clusterMode = newMode;
    graph.nodeColor(colors.nodeColor); //temporary fix
}

function toggleSelectionMode() {
    selectionMode = !selectionMode;
    const button = document.getElementById('subgraph-selector');
    
    if (selectionMode) {
        button.textContent = 'Exit Selection Mode';
        button.style.backgroundColor = '#ff6b6b';
        setupSelectionEvents();
    } else {
        button.textContent = 'Subgraph Selector';
        button.style.backgroundColor = '';
        clearSelection();
        removeSelectionEvents();
    }
}

function toggleSidebar() {
    const controls = document.querySelector('.controls');
    const btn = document.getElementById('sidebar-toggle');
    if (!controls || !btn) return;
    
    const collapsed = controls.classList.toggle('collapsed');
    btn.textContent = collapsed ? '▶' : '◀';
    btn.title = collapsed ? '展开侧栏' : '收起侧栏';
    
    // Trigger resize after CSS transition completes
    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
    }, 400);
}

function setupSelectionEvents() {
    // Disable ForceGraph interactions
    graph.enableNodeDrag(false);
    graph.enablePanInteraction(false);
    
    const container = document.getElementById('graph-container');
    container.addEventListener('mousedown', onSelectionMouseDown, true);
    container.addEventListener('mousemove', onSelectionMouseMove, true);
    container.addEventListener('mouseup', onSelectionMouseUp, true);
    container.style.cursor = 'crosshair';
}

function removeSelectionEvents() {
    const container = document.getElementById('graph-container');
    container.removeEventListener('mousedown', onSelectionMouseDown, true);
    container.removeEventListener('mousemove', onSelectionMouseMove, true);
    container.removeEventListener('mouseup', onSelectionMouseUp, true);
    container.style.cursor = 'default';

    // Re-enable ForceGraph interactions
    graph.enableNodeDrag(true);
    graph.enablePanInteraction(true);

    hideSelectionBox();
}

function onSelectionMouseDown(event) {
    if (!selectionMode) return;
    
    event.preventDefault();
    isSelecting = true;
    const rect = event.currentTarget.getBoundingClientRect();
    selectionStart = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
    showSelectionBox();
}

function onSelectionMouseMove(event) {
    if (!selectionMode || !isSelecting) return;
    
    const rect = event.currentTarget.getBoundingClientRect();
    const currentPos = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
    updateSelectionBox(selectionStart, currentPos);
}

function onSelectionMouseUp(event) {
    if (!selectionMode || !isSelecting) return;
    
    const rect = event.currentTarget.getBoundingClientRect();
    const endPos = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
    
    performSelection(selectionStart, endPos);
    isSelecting = false;
    hideSelectionBox();
}

function showSelectionBox() {
    if (!selectionBox) {
        selectionBox = document.createElement('div');
        selectionBox.style.position = 'absolute';
        selectionBox.style.border = '2px dashed #007bff';
        selectionBox.style.backgroundColor = 'rgba(0, 123, 255, 0.1)';
        selectionBox.style.pointerEvents = 'none';
        selectionBox.style.zIndex = '1000';
        document.getElementById('graph-container').appendChild(selectionBox);
    }
    selectionBox.style.display = 'block';
}

function updateSelectionBox(start, current) {
    if (!selectionBox) return;
    
    const left = Math.min(start.x, current.x);
    const top = Math.min(start.y, current.y);
    const width = Math.abs(current.x - start.x);
    const height = Math.abs(current.y - start.y);
    
    selectionBox.style.left = left + 'px';
    selectionBox.style.top = top + 'px';
    selectionBox.style.width = width + 'px';
    selectionBox.style.height = height + 'px';
}

function hideSelectionBox() {
    if (selectionBox) {
        selectionBox.style.display = 'none';
    }
}

function performSelection(start, end) {
    if (!graph || !nodes) return;
    
    // Convert screen coordinates to graph coordinates
    const startGraph = graph.screen2GraphCoords(start.x, start.y);
    const endGraph = graph.screen2GraphCoords(end.x, end.y);
    
    const bounds = {
        left: Math.min(startGraph.x, endGraph.x),
        right: Math.max(startGraph.x, endGraph.x),
        top: Math.min(startGraph.y, endGraph.y),
        bottom: Math.max(startGraph.y, endGraph.y)
    };
    
    // Find nodes within selection rectangle
    const selectedNodeIds = new Set();
    nodes.forEach(node => {
        if (node.x >= bounds.left && node.x <= bounds.right &&
            node.y >= bounds.top && node.y <= bounds.bottom) {
            selectedNodeIds.add(node.id);
        }
    });
    
    // Find connected nodes and links
    const connectedLinkIds = new Set();

    graph.graphData().links.forEach(link => {
        if (selectedNodeIds.has(link.source.id) || selectedNodeIds.has(link.target.id)) {
            connectedLinkIds.add(link.id);
        }
    });
    
    // Update highlighted items for visual feedback
    highlightedNodes.clear();
    highlightedLinks.clear();
    highlightedNodes = selectedNodeIds;
    highlightedLinks = connectedLinkIds;
    
    graph.nodeColor(colors.nodeColor); //temporary fix
    updateHighlightPanel();
}

function clearSelection() {
    selectedNode = null;
    selectedLink = null;
    highlightedNodes.clear();
    highlightedLinks.clear();
    
    // Force immediate visual update
    if (graph) {
        graph.nodeColor(colors.nodeColor); //temporary fix
    }
    hideHighlightPanel();
}

function calculateAndCacheClusters() {
    if (!nodes || !links) {
        return;
    }
    const clusters = findClusters();
    
    nodes.forEach(node => {
        node.clusterId = clusters.get(node.id) || 0;
    });
    
    clustersCalculated = true;
    console.log(`Clusters calculated and cached. Found ${Math.max(...clusters.values()) + 1} clusters`);
}

function findClusters() {
    const clusters = new Map();
    const visited = new Set();
    let clusterId = 0;
    
    const adjacencyList = new Map();
    nodes.forEach(node => {
        adjacencyList.set(node.id, []);
    });
    
    links.forEach(link => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        
        if (adjacencyList.has(sourceId) && adjacencyList.has(targetId)) {
            adjacencyList.get(sourceId).push(targetId);
            adjacencyList.get(targetId).push(sourceId);
        }
    });
    
    function dfs(nodeId, currentClusterId) {
        if (visited.has(nodeId)) return;
        
        visited.add(nodeId);
        clusters.set(nodeId, currentClusterId);
        
        const neighbors = adjacencyList.get(nodeId) || [];
        neighbors.forEach(neighborId => {
            if (!visited.has(neighborId)) {
                dfs(neighborId, currentClusterId);
            }
        });
    }
    nodes.forEach(node => {
        if (!visited.has(node.id)) {
            dfs(node.id, clusterId);
            clusterId++;
        }
    });
    
    return clusters;
}

// New functions for highlight panel management
function updateHighlightPanel() {
    const panel = document.getElementById('highlight-panel');
    const nodesCountSpan = document.getElementById('nodes-count');
    const linksCountSpan = document.getElementById('links-count');
    const nodesListDiv = document.getElementById('highlighted-nodes-list');
    const linksListDiv = document.getElementById('highlighted-links-list');
    
    // Update counts
    nodesCountSpan.textContent = highlightedNodes.size;
    linksCountSpan.textContent = highlightedLinks.size;
    
    // Clear existing content
    nodesListDiv.innerHTML = '';
    linksListDiv.innerHTML = '';
    
    if (highlightedNodes.size === 0 && highlightedLinks.size === 0) {
        hideHighlightPanel();
        return;
    }
    
    // Populate nodes list
    highlightedNodes.forEach(nodeId => {
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
            const nodeElement = createHighlightNodeElement(node);
            nodesListDiv.appendChild(nodeElement);
        }
    });
    
    // Populate links list
    highlightedLinks.forEach(linkId => {
        const link = graph.graphData().links.find(l => l.id === linkId);
        if (link) {
            const linkElement = createHighlightLinkElement(link);
            linksListDiv.appendChild(linkElement);
        }
    });
    
    showHighlightPanel();
}

function createHighlightNodeElement(node) {
    const div = document.createElement('div');
    div.className = 'highlight-item';
    div.onclick = () => focusOnNode(node);
    
    div.innerHTML = `
        <div class="highlight-item-name">
            <span class="highlight-item-type">NODE</span>
            ${node.name || node.id}
        </div>
        <div class="highlight-item-details">
            ${node.entity_type ? `Type: ${node.entity_type}` : ''}
            ${node.topic_name ? ` | Topic: ${node.topic_name}` : ''}
        </div>
    `;
    
    return div;
}

function createHighlightLinkElement(link) {
    const div = document.createElement('div');
    div.className = 'highlight-item';
    div.onclick = () => focusOnLink(link);
    
    const sourceNode = nodes.find(n => n.id === (typeof link.source === 'object' ? link.source.id : link.source));
    const targetNode = nodes.find(n => n.id === (typeof link.target === 'object' ? link.target.id : link.target));
    
    div.innerHTML = `
        <div class="highlight-item-name">
            <span class="highlight-item-type" style="background: var(--link-highlighted);">LINK</span>
            ${link.description || `Link ${link.id}`}
        </div>
        <div class="highlight-item-details">
            ${sourceNode ? sourceNode.name : 'Unknown'} → ${targetNode ? targetNode.name : 'Unknown'}
            ${link.weight ? ` | Weight: ${link.weight}` : ''}
        </div>
    `;
    
    return div;
}

function focusOnNode(node) {
    if (graph) {
        graph.centerAt(node.x, node.y, 1000);
        graph.zoom(2, 1000);
        
        // Show node details
        showDetails('节点详情', {
            'ID': node.id,
            '名称': node.name,
            '类型': node.entity_type,
            '主题': node.topic_name,
            '属性': node.attributes ? JSON.stringify(node.attributes, null, 2) : '无',
            '创建时间': node.created_at,
            '更新时间': node.updated_at
        });
    }
}

function focusOnLink(link) {
    if (graph) {
        const sourceNode = typeof link.source === 'object' ? link.source : nodes.find(n => n.id === link.source);
        const targetNode = typeof link.target === 'object' ? link.target : nodes.find(n => n.id === link.target);
        
        if (sourceNode && targetNode) {
            // Focus on the midpoint between source and target
            const midX = (sourceNode.x + targetNode.x) / 2;
            const midY = (sourceNode.y + targetNode.y) / 2;
            graph.centerAt(midX, midY, 1000);
            graph.zoom(2, 1000);
        }
        
        // Show link details
        showDetails('连线详情', {
            'ID': link.id,
            '描述': link.description,
            '权重': link.weight,
            '起点': typeof link.source === 'object' ? link.source.id : link.source,
            '终点': typeof link.target === 'object' ? link.target.id : link.target,
            '元数据': link.meta ? JSON.stringify(link.meta, null, 2) : '无',
            '文档ID': link.document_id,
            '片段ID': link.chunk_id,
            '创建时间': link.created_at,
            '更新时间': link.updated_at
        });
    }
}

function showHighlightPanel() {
    const panel = document.getElementById('highlight-panel');
    panel.classList.add('visible');
}

function hideHighlightPanel() {
    const panel = document.getElementById('highlight-panel');
    panel.classList.remove('visible');
}

// JSON export functions
function saveNodesToJson() {
    if (highlightedNodes.size === 0) {
        alert('当前没有高亮节点');
        return;
    }
    
    const highlightedNodesData = [];
    highlightedNodes.forEach(nodeId => {
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
            const cleanNode = {
                id: node.id,
                name: node.name,
                attributes: node.attributes,
                entity_type: node.entity_type,
                topic_name: node.topic_name,
                created_at: node.created_at,
                updated_at: node.updated_at,
            }
            highlightedNodesData.push(cleanNode);
        }
    });
    
    downloadJson(highlightedNodesData, 'highlighted_nodes.json');
}

function saveLinksToJson() {
    if (highlightedLinks.size === 0) {
        alert('当前没有高亮连线');
        return;
    }
    
    const highlightedLinksData = [];
    highlightedLinks.forEach(linkId => {
        const link = graph.graphData().links.find(l => l.id === linkId);
        if (link) {
            const cleanLink = {
                id: link.id,
                description: link.description,
                meta: link.meta,
                weight: link.weight,
                source: typeof link.source === 'object' ? link.source.id : link.source,
                target: typeof link.target === 'object' ? link.target.id : link.target,
                created_at: link.created_at,
                updated_at: link.updated_at,
                document_id: link.document_id,
                chunk_id: link.chunk_id
            };
            highlightedLinksData.push(cleanLink);
        }
    });
    
    downloadJson(highlightedLinksData, 'highlighted_links.json');
}

function downloadJson(data, filename) {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    
    // Clean up
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

