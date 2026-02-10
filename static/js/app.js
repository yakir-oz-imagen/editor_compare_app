// ===========================================================================
// State
// ===========================================================================
let folders = [];          // [{ id, path, name, checked }]
let imageNames = [];       // sorted intersection of filenames
let filteredImages = [];   // after search filter
let selectedImage = null;  // currently selected filename
let displayMode = 'grid';  // 'grid' | 'overlay'
let overlayIndex = 0;      // index into checkedFolders for overlay mode
let nextFolderId = 1;
let sidebarCollapsed = false;

// ===========================================================================
// DOM References
// ===========================================================================
const sidebarEl = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const toggleIcon = document.getElementById('toggle-icon');
const folderInput = document.getElementById('folder-input');
const addFolderBtn = document.getElementById('add-folder-btn');
const folderError = document.getElementById('folder-error');
const folderListEl = document.getElementById('folder-list');
const noFoldersEl = document.getElementById('no-folders');
const imageSearch = document.getElementById('image-search');
const imageListEl = document.getElementById('image-list');
const noImagesEl = document.getElementById('no-images');
const modeGridBtn = document.getElementById('mode-grid');
const modeOverlayBtn = document.getElementById('mode-overlay');
const gridConfig = document.getElementById('grid-config');
const gridRowsInput = document.getElementById('grid-rows');
const gridColsInput = document.getElementById('grid-cols');
const overlayInfo = document.getElementById('overlay-info');
const overlayFolderName = document.getElementById('overlay-folder-name');
const overlayCounter = document.getElementById('overlay-counter');
const gridView = document.getElementById('grid-view');
const overlayView = document.getElementById('overlay-view');
const overlayLabel = document.getElementById('overlay-label');
const overlayImg = document.getElementById('overlay-img');
const emptyState = document.getElementById('empty-state');
const displayArea = document.getElementById('display-area');

// ===========================================================================
// Helpers
// ===========================================================================
function getCheckedFolders() {
    return folders.filter(f => f.checked);
}

function showError(msg) {
    folderError.textContent = msg;
    folderError.classList.remove('hidden');
    setTimeout(() => folderError.classList.add('hidden'), 4000);
}

function imageUrl(folderPath, imageName) {
    return `/api/image?folder=${encodeURIComponent(folderPath)}&name=${encodeURIComponent(imageName)}`;
}

// ===========================================================================
// Sidebar Collapse
// ===========================================================================
sidebarToggle.addEventListener('click', () => {
    sidebarCollapsed = !sidebarCollapsed;
    sidebarEl.classList.toggle('collapsed', sidebarCollapsed);
    toggleIcon.style.transform = sidebarCollapsed ? 'rotate(180deg)' : '';
});

// ===========================================================================
// Folder Management
// ===========================================================================
function renderFolderList() {
    folderListEl.innerHTML = '';
    noFoldersEl.classList.toggle('hidden', folders.length > 0);

    folders.forEach(folder => {
        const li = document.createElement('li');
        li.className = 'folder-item';
        li.dataset.id = folder.id;

        // Drag handle
        const handle = document.createElement('span');
        handle.className = 'drag-handle';
        handle.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16"/></svg>';

        // Checkbox
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = folder.checked;
        cb.className = 'accent-blue-500 cursor-pointer';
        cb.addEventListener('change', () => {
            folder.checked = cb.checked;
            onFolderSelectionChanged();
        });

        // Editable name
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'folder-name';
        nameInput.value = folder.name;
        nameInput.title = folder.path;
        nameInput.addEventListener('change', () => {
            folder.name = nameInput.value || folder.path.split('/').pop();
            renderDisplay();
        });
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') nameInput.blur();
        });

        // Remove button
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.title = 'Remove folder';
        removeBtn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>';
        removeBtn.addEventListener('click', () => {
            folders = folders.filter(f => f.id !== folder.id);
            renderFolderList();
            onFolderSelectionChanged();
        });

        li.appendChild(handle);
        li.appendChild(cb);
        li.appendChild(nameInput);
        li.appendChild(removeBtn);
        folderListEl.appendChild(li);
    });

    initSortable();
}

let sortableInstance = null;

function initSortable() {
    if (sortableInstance) sortableInstance.destroy();
    sortableInstance = new Sortable(folderListEl, {
        animation: 150,
        handle: '.drag-handle',
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        onEnd: (evt) => {
            const movedItem = folders.splice(evt.oldIndex, 1)[0];
            folders.splice(evt.newIndex, 0, movedItem);
            renderDisplay();
        },
    });
}

async function addFolder() {
    const path = folderInput.value.trim();
    if (!path) return;

    // Prevent duplicates
    if (folders.some(f => f.path === path)) {
        showError('Folder already added.');
        return;
    }

    try {
        const res = await fetch('/api/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path }),
        });
        const data = await res.json();

        if (!res.ok) {
            showError(data.error || 'Failed to add folder.');
            return;
        }

        folders.push({
            id: nextFolderId++,
            path: data.path,
            name: data.path.split('/').pop(),
            checked: true,
        });

        folderInput.value = '';
        renderFolderList();
        onFolderSelectionChanged();
    } catch (err) {
        showError('Network error. Is the server running?');
    }
}

addFolderBtn.addEventListener('click', addFolder);
folderInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addFolder();
});

// ===========================================================================
// Image Intersection
// ===========================================================================
async function fetchImageIntersection() {
    const checked = getCheckedFolders();
    if (checked.length === 0) {
        imageNames = [];
        filteredImages = [];
        selectedImage = null;
        renderImageList();
        renderDisplay();
        return;
    }

    try {
        const res = await fetch('/api/images', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folders: checked.map(f => f.path) }),
        });
        const data = await res.json();
        imageNames = data.images || [];
    } catch {
        imageNames = [];
    }

    applyImageFilter();

    // Keep selection if still valid, otherwise select first
    if (selectedImage && !imageNames.includes(selectedImage)) {
        selectedImage = imageNames.length > 0 ? imageNames[0] : null;
    } else if (!selectedImage && imageNames.length > 0) {
        selectedImage = imageNames[0];
    }

    renderImageList();
    renderDisplay();
}

function onFolderSelectionChanged() {
    fetchImageIntersection();
}

// ===========================================================================
// Image List (Sidebar)
// ===========================================================================
function applyImageFilter() {
    const query = imageSearch.value.trim().toLowerCase();
    filteredImages = query
        ? imageNames.filter(name => name.toLowerCase().includes(query))
        : [...imageNames];
}

function renderImageList() {
    imageListEl.innerHTML = '';
    noImagesEl.classList.toggle('hidden', filteredImages.length > 0);

    filteredImages.forEach(name => {
        const li = document.createElement('li');
        li.className = 'image-item' + (name === selectedImage ? ' selected' : '');
        li.textContent = name;
        li.title = name;
        li.addEventListener('click', () => {
            selectImage(name);
        });
        imageListEl.appendChild(li);
    });

    scrollSelectedIntoView();
}

function selectImage(name) {
    selectedImage = name;
    overlayIndex = 0;
    renderImageList();
    renderDisplay();
}

function scrollSelectedIntoView() {
    const selectedEl = imageListEl.querySelector('.image-item.selected');
    if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
    }
}

imageSearch.addEventListener('input', () => {
    applyImageFilter();
    renderImageList();
});

// ===========================================================================
// Keyboard Navigation
// ===========================================================================
document.addEventListener('keydown', (e) => {
    // Don't intercept when typing in inputs
    const tag = e.target.tagName;
    const isInput = tag === 'INPUT' || tag === 'TEXTAREA';

    if (e.key === 'ArrowUp' && !isInput) {
        e.preventDefault();
        navigateImageList(-1);
    } else if (e.key === 'ArrowDown' && !isInput) {
        e.preventDefault();
        navigateImageList(1);
    } else if (e.key === 'ArrowLeft' && !isInput && displayMode === 'overlay') {
        e.preventDefault();
        navigateOverlay(-1);
    } else if (e.key === 'ArrowRight' && !isInput && displayMode === 'overlay') {
        e.preventDefault();
        navigateOverlay(1);
    }
});

function navigateImageList(direction) {
    if (filteredImages.length === 0) return;

    let idx = filteredImages.indexOf(selectedImage);
    if (idx === -1) {
        idx = 0;
    } else {
        idx += direction;
        if (idx < 0) idx = filteredImages.length - 1;
        if (idx >= filteredImages.length) idx = 0;
    }

    selectImage(filteredImages[idx]);
}

function navigateOverlay(direction) {
    const checked = getCheckedFolders();
    if (checked.length === 0) return;

    overlayIndex += direction;
    if (overlayIndex < 0) overlayIndex = checked.length - 1;
    if (overlayIndex >= checked.length) overlayIndex = 0;

    renderOverlay();
}

// ===========================================================================
// Display Mode
// ===========================================================================
function setMode(mode) {
    displayMode = mode;
    modeGridBtn.classList.toggle('active', mode === 'grid');
    modeOverlayBtn.classList.toggle('active', mode === 'overlay');
    gridConfig.classList.toggle('hidden', mode !== 'grid');
    overlayInfo.classList.toggle('hidden', mode !== 'overlay');
    renderDisplay();
}

modeGridBtn.addEventListener('click', () => setMode('grid'));
modeOverlayBtn.addEventListener('click', () => setMode('overlay'));

gridRowsInput.addEventListener('input', () => renderDisplay());
gridColsInput.addEventListener('input', () => renderDisplay());

// ===========================================================================
// Render Display
// ===========================================================================
function renderDisplay() {
    const checked = getCheckedFolders();

    if (!selectedImage || checked.length === 0) {
        gridView.classList.add('hidden');
        overlayView.classList.add('hidden');
        emptyState.classList.remove('hidden');
        overlayInfo.classList.add('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    if (displayMode === 'grid') {
        gridView.classList.remove('hidden');
        overlayView.classList.add('hidden');
        overlayInfo.classList.add('hidden');
        renderGrid();
    } else {
        gridView.classList.add('hidden');
        overlayView.classList.remove('hidden');
        overlayInfo.classList.remove('hidden');
        if (overlayIndex >= checked.length) overlayIndex = 0;
        renderOverlay();
    }
}

// ===========================================================================
// Grid Mode
// ===========================================================================
function renderGrid() {
    const checked = getCheckedFolders();
    const rows = Math.max(1, parseInt(gridRowsInput.value) || 1);
    const cols = Math.max(1, parseInt(gridColsInput.value) || 2);

    gridView.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    gridView.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    gridView.innerHTML = '';

    checked.forEach(folder => {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';

        const label = document.createElement('div');
        label.className = 'cell-label';
        label.textContent = folder.name;
        label.title = folder.path;

        const img = document.createElement('img');
        img.src = imageUrl(folder.path, selectedImage);
        img.alt = `${folder.name} - ${selectedImage}`;
        img.loading = 'eager';

        cell.appendChild(label);
        cell.appendChild(img);
        gridView.appendChild(cell);
    });
}

// ===========================================================================
// Overlay Mode
// ===========================================================================
function renderOverlay() {
    const checked = getCheckedFolders();
    if (checked.length === 0 || !selectedImage) return;

    if (overlayIndex >= checked.length) overlayIndex = 0;

    const folder = checked[overlayIndex];
    overlayLabel.textContent = folder.name;
    overlayImg.src = imageUrl(folder.path, selectedImage);
    overlayImg.alt = `${folder.name} - ${selectedImage}`;

    overlayFolderName.textContent = folder.name;
    overlayCounter.textContent = `(${overlayIndex + 1} / ${checked.length})`;

    // Preload adjacent images
    preloadOverlayImages(checked);
}

function preloadOverlayImages(checked) {
    const prevIdx = (overlayIndex - 1 + checked.length) % checked.length;
    const nextIdx = (overlayIndex + 1) % checked.length;

    [prevIdx, nextIdx].forEach(idx => {
        if (idx !== overlayIndex) {
            const img = new Image();
            img.src = imageUrl(checked[idx].path, selectedImage);
        }
    });
}

// ===========================================================================
// Initialize
// ===========================================================================
setMode('grid');
renderFolderList();
renderImageList();
renderDisplay();
