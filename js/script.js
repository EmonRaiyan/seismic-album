// =====================================================
// CONFIGURATION SECTION - EDIT THESE VALUES
// =====================================================

// Admin Password (Change this!)
const ADMIN_PASSWORD = 'seismicmag2024';
// Load memories from Supabase (falls back to localStorage on error)
async function loadMemoriesFromSupabase() {
    if (!supabaseClient) {
        memories = JSON.parse(localStorage.getItem('seismicMemories') || '[]');
        updateGallery();
        updateMemoryList();
        initLiveNetwork();
        return;
    }

    try {
        const { data, error } = await supabaseClient.from('memories').select('*').order('timestamp', { ascending: false });
        if (error) {
            console.log('Supabase load error:', error);
            memories = JSON.parse(localStorage.getItem('seismicMemories') || '[]');
        } else if (data && Array.isArray(data) && data.length > 0) {
            memories = data;
            // keep local cache in sync
            localStorage.setItem('seismicMemories', JSON.stringify(memories));
        } else {
            memories = JSON.parse(localStorage.getItem('seismicMemories') || '[]');
        }
    } catch (err) {
        console.log('Failed to load memories from Supabase:', err);
        memories = JSON.parse(localStorage.getItem('seismicMemories') || '[]');
    }

    updateGallery();
    updateMemoryList();
    initLiveNetwork();
}

// Helpers for CRUD operations against Supabase with graceful fallback
async function saveMemoryToSupabase(memory) {
    if (!supabaseClient) return { error: new Error('No supabase client') };
    try {
        const payload = {
            name: memory.name,
            quote: memory.quote,
            photo: memory.photo,
            timestamp: memory.timestamp
        };
        const { data, error } = await supabaseClient.from('memories').insert(payload).select().single();
        return { data, error };
    } catch (err) {
        return { error: err };
    }
}

async function updateMemoryInSupabase(memory) {
    if (!supabaseClient) return { error: new Error('No supabase client') };
    try {
        const { data, error } = await supabaseClient.from('memories').update({
            name: memory.name,
            quote: memory.quote,
            photo: memory.photo,
            timestamp: memory.timestamp
        }).eq('id', memory.id).select().single();
        return { data, error };
    } catch (err) {
        return { error: err };
    }
}

async function deleteMemoryFromSupabase(id) {
    if (!supabaseClient) return { error: new Error('No supabase client') };
    try {
        const { data, error } = await supabaseClient.from('memories').delete().eq('id', id).select();
        return { data, error };
    } catch (err) {
        return { error: err };
    }
}

// Upload a File object to Supabase Storage `memories` bucket and return a public URL
async function uploadImageToSupabase(file) {
    // Try Vercel server upload first (if endpoint available), then fall back to direct Supabase storage.
    if (typeof USE_VERCEL_UPLOAD !== 'undefined' && USE_VERCEL_UPLOAD) {
        try {
            const reader = new FileReader();
            const base64 = await new Promise((resolve, reject) => {
                reader.onload = () => resolve(String(reader.result).split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            const res = await fetch(typeof VERCEL_UPLOAD_ENDPOINT !== 'undefined' ? VERCEL_UPLOAD_ENDPOINT : '/api/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileName: file.name, fileType: file.type, dataBase64: base64 })
            });

            if (res.ok) {
                const j = await res.json();
                if (j && j.publicURL) return { publicURL: j.publicURL };
            } else {
                console.log('Vercel upload returned non-OK status');
            }
        } catch (err) {
            console.log('Vercel upload error (falling back):', err);
        }
    }

    if (!supabaseClient) return { error: new Error('No supabase client') };
    try {
        const fileExt = (file.name || '').split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
        const filePath = fileName;

        const { error: uploadError } = await supabaseClient.storage.from('memories').upload(filePath, file, { cacheControl: '3600', upsert: false });
        if (uploadError) return { error: uploadError };

        const publicRes = supabaseClient.storage.from('memories').getPublicUrl(filePath);
        const publicURL = (publicRes && (publicRes.publicURL || (publicRes.data && (publicRes.data.publicUrl || publicRes.data.publicURL)))) || null;
        return { publicURL };
    } catch (err) {
        return { error: err };
    }
}

// Try to remove a file from storage given a public URL (best-effort)
async function deleteStorageFileFromUrl(url) {
    if (!supabaseClient || !url) return { error: new Error('No supabase client or url') };
    try {
        const marker = '/storage/v1/object/public/';
        const idx = url.indexOf(marker);
        if (idx === -1) return { error: new Error('URL is not a Supabase public storage URL') };
        const path = url.slice(idx + marker.length); // bucket/path...
        const parts = path.split('/');
        const bucket = parts.shift();
        const objectPath = parts.join('/');
        if (!bucket || !objectPath) return { error: new Error('Invalid storage URL') };

        const { error } = await supabaseClient.storage.from(bucket).remove([objectPath]);
        return { error };
    } catch (err) {
        return { error: err };
    }
}

// -----------------------------
// Supabase client (browser)
// -----------------------------
const SUPABASE_URL = 'https://yngilukotofcigzrcyiy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InluZ2lsdWtvdG9mY2lnenJjeWl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0NzA0MjAsImV4cCI6MjA4NjA0NjQyMH0.NlwbcPzF1J_LIyErX5q-zPiHHir5jbA8o1kKRyoIeIU';
// `supabase` is provided by the UMD bundle included in index.html
const supabaseClient = typeof supabase !== 'undefined'
    ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// Vercel upload endpoint configuration. Set to true if you will deploy this project to Vercel
const USE_VERCEL_UPLOAD = true;
const VERCEL_UPLOAD_ENDPOINT = '/api/upload';

// Test connection (non-blocking) — logs result to console.
async function testSupabaseConnection() {
    if (!supabaseClient) {
        console.log('Supabase client not available. Did you include the CDN?');
        return;
    }

    try {
        // Attempt a safe, read-only query. If the table doesn't exist this will surface an error in console only.
        const { data, error } = await supabaseClient.from('memories').select('*').limit(1);
        if (error) console.log('Supabase query error (table may not exist):', error);
        else console.log('Supabase test query success:', data);
    } catch (err) {
        console.log('Supabase connection test failed:', err);
    }
}

// Motivational Messages - Add or edit messages here
// Each visit will show a random message from this list
const MOTIVATIONAL_MESSAGES = [
    "Home is not a place, it's a feeling. Welcome to where memories live forever.",
    "nothing kills you faster than your own mind,dont stress over things that are out of your control.",
    "Every photo tells a story, every face holds a memory. Together, we are Seismic.",
    "be like a flower that gives fragrance even to the hands that crushes it.",
    "In the tapestry of life, each thread matters. Your memories weave our collective story.",
    "Seismic is more than an album—it's a celebration of moments that shaped us.",
    "be happy ,not because everything is good but because you can see the good in everything.",
    "The best things in life are the people we love, the places we've been, and the memories we've made along the way.",
    "Home is where your story begins. Let's write it together, one memory at a time.",
    "the wait is longer beaucse the blessing is bigger.",
    "Memories are the architecture of our identity. Build yours here.",
    "accept what you cant change, change what you cant accept",
    "Life is a collection of moments. Make them count. Share them here.",
    "be kind to youself, be proud of yourselft, be patient with your self. Take care of the most impotant person in your life : yourself.",
    "Together we create, together we remember, together we are Seismic.",
    "you cant go back, so dont look back focus on today thats all that matter what you do from this point forward is what really counts",
    "Your memories are treasures. This is your vault, your sanctuary, your home.",
    "choose you becasuse when you start choosing you,you start attracting everything that is also choosing you.",
    "Every smile, every face, every moment—together they create the essence of who we are.",
    "everything ending can be a beginning.",
    "Seismic: Where past meets present, where memories become eternal.",
    "Good manners shine brighter than any makeup. Be kind, be humble, be you.",
    "In a world of constant change, memories are our anchor. Welcome home.",
    "Dont grieve. Anything you lose comes round in another form  ",
    "This is not just an album. This is our legacy, our history, our heart.",
    "You deserve the same kindness you give others.",
    "You are becoming someone your younger self needed. Be proud of how far you've come, and have faith in how far you can go.",
    "Life removes things to make space for better things. Trust the process.",
    "everything remains remory except the memories you make with the people you love",
    "One day, today will just be a memory, and you will either smile at it or wish you had lived it better.",
    "In the end, everything remains a memory — so live today in a way your future self will remember with peace, not regret.",
    "Life sometimes removes things from your life because you are meant to grow beyond them, not because you were not good enough." ,

    "Capture the moment before it becomes a memory. Preserve the memory before it fades."
];

// Visualization Title Messages - Add or edit titles here
// Rotates through these when viewing the network visualization
const VISUALIZATION_TITLES = [
    {
        title: "Seismic is Home",
        subtitle: "Where memories connect and stories intertwine"
    },
    {
        title: "We Are Family",
        subtitle: "Bound by moments, united by memories"
    },
    {
        title: "Connected Hearts",
        subtitle: "Every face a story, every connection a bond"
    },
    {
        title: "Our Story Unfolds",
        subtitle: "Together we create the tapestry of memories"
    },
    {
        title: "Memories That Matter",
        subtitle: "Celebrating the moments that made us who we are"
    },
    {
        title: "The Seismic Family",
        subtitle: "Where every memory finds its place in our hearts"
    }
];

// =====================================================
// MAIN APPLICATION CODE
// =====================================================

// Data storage
let memories = JSON.parse(localStorage.getItem('seismicMemories') || '[]');
let isAdmin = false;

// Live Network D3 variables
let liveSvg, liveG, liveSimulation;

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    try {
        showWelcomeModal();
        updateGallery();
        updateMemoryList();
        
        // Initialize live network
        initLiveNetwork();
        // Test Supabase connection (optional)
        testSupabaseConnection();
        // Load memories (from Supabase when available, otherwise localStorage) - non-blocking
        loadMemoriesFromSupabase().catch(err => console.log('Load error:', err));
    } catch(err) {
        console.error('Init error:', err);
    }
    
    // File input label update - safe selectors
    const photoInput = document.getElementById('photo');
    if (photoInput) {
        photoInput.addEventListener('change', function(e) {
            const label = document.querySelector('.file-input-label');
            if (e.target.files.length > 0) {
                label.textContent = `✓ ${e.target.files[0].name}`;
                label.style.color = '#825A6D';
            }
        });
    }

    const editPhotoInput = document.getElementById('editPhoto');
    if (editPhotoInput) {
        editPhotoInput.addEventListener('change', function(e) {
            const label = document.querySelector('#editPhoto + .file-input-label');
            if (label && e.target.files.length > 0) {
                label.textContent = `✓ ${e.target.files[0].name}`;
                label.style.color = '#825A6D';
            }
        });
    }
});

// Welcome Modal Functions
function showWelcomeModal() {
    const modal = document.getElementById('welcomeModal');
    const messageElement = document.getElementById('welcomeMessage');
    
    // Get a random motivational message
    const randomMessage = MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)];
    messageElement.textContent = randomMessage;
    
    modal.classList.remove('hidden');
}

function closeWelcomeModal() {
    const modal = document.getElementById('welcomeModal');
    modal.classList.add('hidden');
}

// Tab switching
function switchTab(tabName) {
    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    // Find and activate the corresponding button if it exists
    const targetBtn = Array.from(document.querySelectorAll('.tab-btn')).find(
        btn => btn.onclick && btn.onclick.toString().includes(`'${tabName}'`)
    );
    if (targetBtn) {
        targetBtn.classList.add('active');
    }

    // Update sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(tabName).classList.add('active');
}

// Form submission
const uploadForm = document.getElementById('uploadForm');
if (uploadForm) {
    uploadForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const name = document.getElementById('name').value;
        const quote = document.getElementById('quote').value;
        const photoFile = document.getElementById('photo').files[0];

        if (!photoFile) {
            alert('Please select a photo');
            return;
        }

        const allowedTypes = ['image/jpeg','image/png','image/webp'];
        const MAX_BYTES = 3 * 1024 * 1024;
        if (photoFile.size > MAX_BYTES) { showNotification('File too large (max 3MB)'); return; }
        if (photoFile.type && !allowedTypes.includes(photoFile.type)) { showNotification('Unsupported file type'); return; }

        showUploadOverlay('Uploading…');
        try {
            let photoValue = null;
            if (supabaseClient) {
                const { publicURL, error } = await uploadImageToSupabase(photoFile);
                photoValue = (publicURL) ? publicURL : await readFileAsDataURL(photoFile);
            } else {
                photoValue = await readFileAsDataURL(photoFile);
            }

            const memoryPayload = { name, quote, photo: photoValue, timestamp: new Date().toISOString() };
            let memory = null;

            if (supabaseClient) {
                const { data, error } = await saveMemoryToSupabase(memoryPayload);
                if (error) {
                    memory = { id: Date.now(), ...memoryPayload };
                    showNotification('Saved locally — Supabase failed');
                } else {
                    memory = data;
                }
            } else {
                memory = { id: Date.now(), ...memoryPayload };
            }

            memories.push(memory);
            localStorage.setItem('seismicMemories', JSON.stringify(memories));
            document.getElementById('uploadForm').reset();
            const label = document.querySelector('.file-input-label');
            if (label) { label.textContent = '📸 Click to select photo'; label.style.color = ''; }
            updateGallery();
            updateMemoryList();
            updateLiveNetwork(memory);
            showSuccessNotification('Memory added successfully! ✨');
        } catch (err) {
            console.error('Upload error:', err);
            showNotification('Upload failed');
        } finally {
            hideUploadOverlay();
        }
    });
}

// Edit form submission
const editForm = document.getElementById('editForm');
if (editForm) {
    editForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const id = parseInt(document.getElementById('editId').value);
        const name = document.getElementById('editName').value;
        const quote = document.getElementById('editQuote').value;
        const photoFile = document.getElementById('editPhoto').files[0];

        const memory = memories.find(m => m.id === id);
        if (!memory) return;

        memory.name = name;
        memory.quote = quote;

        if (photoFile) {
            const allowedTypes = ['image/jpeg','image/png','image/webp'];
            const MAX_BYTES = 3 * 1024 * 1024;
            if (photoFile.size > MAX_BYTES) { showNotification('File too large (max 3MB)'); return; }
            if (photoFile.type && !allowedTypes.includes(photoFile.type)) { showNotification('Unsupported file type'); return; }

            showUploadOverlay('Uploading…');
            try {
                if (supabaseClient) {
                    const { publicURL, error } = await uploadImageToSupabase(photoFile);
                    memory.photo = (publicURL) ? publicURL : await readFileAsDataURL(photoFile);
                } else {
                    memory.photo = await readFileAsDataURL(photoFile);
                }
            } catch (err) {
                console.error('Photo upload error:', err);
            } finally {
                hideUploadOverlay();
            }
        }

        if (supabaseClient) {
            const { data, error } = await updateMemoryInSupabase(memory);
            if (!error && data) {
                const idx = memories.findIndex(m => m.id === data.id);
                if (idx !== -1) memories[idx] = data;
                showNotification('Memory updated successfully! ✨');
            } else {
                localStorage.setItem('seismicMemories', JSON.stringify(memories));
                showNotification('Updated locally');
            }
        } else {
            localStorage.setItem('seismicMemories', JSON.stringify(memories));
            showNotification('Memory updated successfully! ✨');
        }

        closeEditModal();
        updateGallery();
        updateMemoryList();
    });
}

// Update gallery
function updateGallery() {
    const grid = document.getElementById('galleryGrid');
    
    if (memories.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: var(--text-secondary);">
                <div style="font-size: 3rem; margin-bottom: 1rem;">📸</div>
                <div style="font-size: 0.875rem; letter-spacing: 0.1em; text-transform: uppercase;">
                    No memories yet. Add your first memory!
                </div>
            </div>
        `;
        return;
    }

    grid.innerHTML = memories.map(memory => `
        <div class="gallery-item">
            <img src="${memory.photo}" alt="${memory.name}">
            <div class="gallery-overlay">
                <div class="gallery-name">${memory.name}</div>
                <div class="gallery-quote">"${memory.quote}"</div>
            </div>
        </div>
    `).join('');
}

// Update memory list (admin)
function updateMemoryList() {
    const list = document.getElementById('memoryList');
    
    if (memories.length === 0) {
        list.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                No memories to manage yet.
            </div>
        `;
        return;
    }

    list.innerHTML = memories.map(memory => `
        <div class="memory-item">
            <img src="${memory.photo}" alt="${memory.name}" class="memory-thumb">
            <div class="memory-info">
                <div class="memory-name">${memory.name}</div>
                <div class="memory-quote-preview">"${memory.quote.substring(0, 50)}${memory.quote.length > 50 ? '...' : ''}"</div>
            </div>
            <div class="memory-actions">
                <button class="action-btn" onclick="openEditModal(${memory.id})">✏️ Edit</button>
                <button class="action-btn delete" onclick="deleteMemory(${memory.id})">🗑️ Delete</button>
            </div>
        </div>
    `).join('');
}

// Admin functions
function checkAdminPassword() {
    const password = document.getElementById('adminPassword').value;
    if (password === ADMIN_PASSWORD) {
        isAdmin = true;
        document.getElementById('passwordForm').style.display = 'none';
        document.getElementById('adminActions').classList.add('active');
        showNotification('Admin access granted! 🔓');
    } else {
        showNotification('Incorrect password ❌');
    }
}

function openEditModal(id) {
    const memory = memories.find(m => m.id === id);
    if (!memory) return;

    document.getElementById('editId').value = memory.id;
    document.getElementById('editName').value = memory.name;
    document.getElementById('editQuote').value = memory.quote;
    document.getElementById('editModal').classList.add('active');
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
    document.getElementById('editForm').reset();
    document.querySelector('#editPhoto + .file-input-label').textContent = '📸 Click to change photo';
    document.querySelector('#editPhoto + .file-input-label').style.color = '';
}

async function deleteMemory(id) {
    if (!confirm('Are you sure you want to delete this memory?')) return;
    const memory = memories.find(m => m.id === id);

    // If using Vercel server endpoint, call it to delete storage object and DB row with service role key
    if (typeof USE_VERCEL_UPLOAD !== 'undefined' && USE_VERCEL_UPLOAD) {
        try {
            const resp = await fetch('/api/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, photoUrl: memory ? memory.photo : null })
            });
            if (!resp.ok) {
                const txt = await resp.text();
                console.log('Server delete failed:', txt);
                showNotification('Deleted locally — server delete failed');
            }
        } catch (err) {
            console.log('Server delete error:', err);
            showNotification('Deleted locally — server delete failed');
        }
    } else {
        // Attempt to delete via Supabase client (best-effort)
        if (memory && memory.photo && memory.photo.indexOf('/storage/v1/object/public/') !== -1 && supabaseClient) {
            const { error } = await deleteStorageFileFromUrl(memory.photo);
            if (error) console.log('Failed to delete storage file (best-effort):', error);
        }

        if (supabaseClient) {
            const { error } = await deleteMemoryFromSupabase(id);
            if (error) {
                console.log('Supabase delete error:', error);
                showNotification('Deleted locally — Supabase delete failed');
            }
        }
    }

    memories = memories.filter(m => m.id !== id);
    localStorage.setItem('seismicMemories', JSON.stringify(memories));
    
    updateGallery();
    updateMemoryList();
    if (document.getElementById('visualization') && document.getElementById('visualization').classList.contains('active')) {
        initVisualization();
    }
    showNotification('Memory deleted successfully');
}

// Upload overlay helpers
function showUploadOverlay(text = 'Uploading…') {
    try {
        const overlay = document.getElementById('uploadOverlay');
        if (!overlay) return;
        overlay.setAttribute('aria-hidden', 'false');
        const t = overlay.querySelector('.upload-text');
        if (t) t.textContent = text;
    } catch(e) { console.log('Overlay error:', e); }
}
function hideUploadOverlay() {
    try {
        const overlay = document.getElementById('uploadOverlay');
        if (!overlay) return;
        overlay.setAttribute('aria-hidden', 'true');
    } catch(e) { console.log('Overlay error:', e); }
}

// Helper to read file as data URL
function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
    });
}

// Notification
function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 2rem;
        right: 2rem;
        background: rgba(255, 255, 255, 0.98);
        backdrop-filter: blur(20px);
        border: 1px solid var(--accent-1);
        border-radius: 15px;
        padding: 1rem 1.5rem;
        color: var(--text-primary);
        font-family: 'IBM Plex Mono', monospace;
        font-size: 0.875rem;
        z-index: 1000;
        animation: slideInRight 0.3s ease-out;
        box-shadow: 0 10px 40px rgba(130, 90, 109, 0.2);
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Initialize D3 Visualization
// Initialize on resize
window.addEventListener('resize', () => {
    if (document.getElementById('upload').classList.contains('active')) {
        initLiveNetwork();
    }
});

// Success Notification Function
function showSuccessNotification(message) {
    const notification = document.getElementById('successNotification');
    const textElement = notification.querySelector('.notification-text');
    
    textElement.textContent = message;
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Live Network Visualization
function initLiveNetwork() {
    const container = document.getElementById('liveGraph');
    if (!container) return;
    
    // Clear existing
    container.innerHTML = '';
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    // Create SVG
    liveSvg = d3.select('#liveGraph')
        .append('svg')
        .attr('width', width)
        .attr('height', height);
    
    liveG = liveSvg.append('g');
    
    // Add zoom behavior
    const zoomBehavior = d3.zoom()
        .scaleExtent([0.3, 3])
        .on('zoom', (event) => {
            liveG.attr('transform', event.transform);
        });
    
    liveSvg.call(zoomBehavior);
    
    // If no memories, show placeholder
    if (memories.length === 0) {
        liveSvg.append('text')
            .attr('x', width / 2)
            .attr('y', height / 2)
            .attr('text-anchor', 'middle')
            .attr('fill', '#9ca3af')
            .attr('font-size', '0.875rem')
            .attr('font-family', 'IBM Plex Mono, monospace')
            .text('Add your first memory to see the network grow!');
        return;
    }
    
    // Create network data
    const nodes = memories.map(m => ({...m}));
    const links = [];
    
    // Generate connections
    for (let i = 0; i < memories.length; i++) {
        const numConnections = Math.min(2 + Math.floor(Math.random() * 2), memories.length - 1);
        const connectedIndices = new Set([i]);
        
        for (let j = 0; j < numConnections; j++) {
            let randomIndex;
            let attempts = 0;
            do {
                randomIndex = Math.floor(Math.random() * memories.length);
                attempts++;
            } while (connectedIndices.has(randomIndex) && attempts < 10);
            
            if (!connectedIndices.has(randomIndex) && randomIndex !== i) {
                links.push({
                    source: memories[i].id,
                    target: memories[randomIndex].id
                });
                connectedIndices.add(randomIndex);
            }
        }
    }
    
    // Force simulation
    liveSimulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id(d => d.id).distance(120).strength(0.3))
        .force('charge', d3.forceManyBody().strength(-400))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(50))
        .force('x', d3.forceX(width / 2).strength(0.05))
        .force('y', d3.forceY(height / 2).strength(0.05));
    
    // Create links
    const link = liveG.append('g')
        .selectAll('line')
        .data(links)
        .enter()
        .append('line')
        .attr('class', 'link')
        .attr('stroke', 'rgba(130, 90, 109, 0.2)')
        .attr('stroke-width', 2);
    
    // Create nodes
    const node = liveG.append('g')
        .selectAll('g')
        .data(nodes)
        .enter()
        .append('g')
        .attr('class', 'node')
        .call(d3.drag()
            .on('start', dragStartedLive)
            .on('drag', draggedLive)
            .on('end', dragEndedLive));
    
    // Add circles with images
    node.each(function(d, i) {
        const nodeGroup = d3.select(this);
        
        // Define clip path
        liveSvg.append('defs')
            .append('clipPath')
            .attr('id', `live-clip-${d.id}`)
            .append('circle')
            .attr('r', 30);
        
        // Add circle background
        nodeGroup.append('circle')
            .attr('r', 30)
            .attr('fill', 'white')
            .attr('stroke', '#825A6D')
            .attr('stroke-width', 2)
            .style('cursor', 'grab')
            .style('filter', 'drop-shadow(0 2px 4px rgba(130, 90, 109, 0.15))');
        
        // Add image
        nodeGroup.append('image')
            .attr('xlink:href', d.photo)
            .attr('x', -30)
            .attr('y', -30)
            .attr('width', 60)
            .attr('height', 60)
            .attr('clip-path', `url(#live-clip-${d.id})`)
            .style('pointer-events', 'none');
        
        // Add label
        nodeGroup.append('text')
            .attr('dy', 45)
            .attr('text-anchor', 'middle')
            .attr('font-size', '0.7rem')
            .attr('font-weight', '600')
            .attr('fill', '#1a1a1a')
            .text(d.name)
            .style('pointer-events', 'none');
    });
    
    // Tooltip functionality
    const tooltip = document.getElementById('tooltip');
    const tooltipName = tooltip.querySelector('.tooltip-name');
    const tooltipQuote = tooltip.querySelector('.tooltip-quote');

    node.on('mouseenter', function(event, d) {
        // Highlight connected links
        link.classed('highlight', l => l.source.id === d.id || l.target.id === d.id);
        
        // Show tooltip
        tooltipName.textContent = d.name;
        tooltipQuote.textContent = `"${d.quote}"`;
        
        tooltip.style.left = (event.pageX + 15) + 'px';
        tooltip.style.top = (event.pageY + 15) + 'px';
        tooltip.classList.add('show');
    });

    node.on('mousemove', function(event) {
        tooltip.style.left = (event.pageX + 15) + 'px';
        tooltip.style.top = (event.pageY + 15) + 'px';
    });

    node.on('mouseleave', function() {
        // Remove link highlighting
        link.classed('highlight', false);
        tooltip.classList.remove('show');
    });
    
    // Update positions
    liveSimulation.on('tick', () => {
        link
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);
        
        node.attr('transform', d => `translate(${d.x},${d.y})`);
    });
}

// Update live network with new node animation
function updateLiveNetwork(newMemory) {
    if (!liveSvg || !liveSimulation) {
        initLiveNetwork();
        return;
    }
    
    const container = document.getElementById('liveGraph');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    // Choose random entry direction
    const directions = ['left', 'right', 'top', 'bottom'];
    const direction = directions[Math.floor(Math.random() * directions.length)];
    
    // Set initial position based on direction
    let startX, startY;
    switch(direction) {
        case 'left':
            startX = -100;
            startY = height / 2;
            break;
        case 'right':
            startX = width + 100;
            startY = height / 2;
            break;
        case 'top':
            startX = width / 2;
            startY = -100;
            break;
        case 'bottom':
            startX = width / 2;
            startY = height + 100;
            break;
    }
    
    // Add new node with starting position
    const newNode = {...newMemory, x: startX, y: startY, vx: 0, vy: 0};
    
    // Get current nodes
    const currentNodes = liveSimulation.nodes();
    currentNodes.push(newNode);
    
    // Generate new links
    const links = [];
    for (let i = 0; i < currentNodes.length; i++) {
        const numConnections = Math.min(2 + Math.floor(Math.random() * 2), currentNodes.length - 1);
        const connectedIndices = new Set([i]);
        
        for (let j = 0; j < numConnections; j++) {
            let randomIndex;
            let attempts = 0;
            do {
                randomIndex = Math.floor(Math.random() * currentNodes.length);
                attempts++;
            } while (connectedIndices.has(randomIndex) && attempts < 10);
            
            if (!connectedIndices.has(randomIndex) && randomIndex !== i) {
                links.push({
                    source: currentNodes[i].id,
                    target: currentNodes[randomIndex].id
                });
                connectedIndices.add(randomIndex);
            }
        }
    }
    
    // Update simulation
    liveSimulation.nodes(currentNodes);
    liveSimulation.force('link').links(links);
    
    // Update visual elements
    const link = liveG.select('g').selectAll('line')
        .data(links);
    
    link.exit().remove();
    
    link.enter()
        .append('line')
        .attr('class', 'link')
        .attr('stroke', 'rgba(130, 90, 109, 0.2)')
        .attr('stroke-width', 2)
        .merge(link);
    
    const node = liveG.selectAll('g').filter(function() {
        return this.classList.contains('node');
    }).data(currentNodes, d => d.id);
    
    node.exit().remove();
    
    const nodeEnter = node.enter()
        .append('g')
        .attr('class', 'node')
        .call(d3.drag()
            .on('start', dragStartedLive)
            .on('drag', draggedLive)
            .on('end', dragEndedLive));
    
    nodeEnter.each(function(d) {
        const nodeGroup = d3.select(this);
        
        // Define clip path
        liveSvg.select('defs')
            .append('clipPath')
            .attr('id', `live-clip-${d.id}`)
            .append('circle')
            .attr('r', 30);
        
        // Add circle background with animation
        nodeGroup.append('circle')
            .attr('r', 0)
            .attr('fill', 'white')
            .attr('stroke', '#825A6D')
            .attr('stroke-width', 2)
            .style('cursor', 'grab')
            .style('filter', 'drop-shadow(0 2px 4px rgba(130, 90, 109, 0.15))')
            .transition()
            .duration(600)
            .attr('r', 30);
        
        // Add image with delayed fade-in
        nodeGroup.append('image')
            .attr('xlink:href', d.photo)
            .attr('x', -30)
            .attr('y', -30)
            .attr('width', 60)
            .attr('height', 60)
            .attr('clip-path', `url(#live-clip-${d.id})`)
            .style('opacity', 0)
            .style('pointer-events', 'none')
            .transition()
            .delay(200)
            .duration(400)
            .style('opacity', 1);
        
        // Add label with delayed fade-in
        nodeGroup.append('text')
            .attr('dy', 45)
            .attr('text-anchor', 'middle')
            .attr('font-size', '0.7rem')
            .attr('font-weight', '600')
            .attr('fill', '#1a1a1a')
            .text(d.name)
            .style('opacity', 0)
            .style('pointer-events', 'none')
            .transition()
            .delay(300)
            .duration(400)
            .style('opacity', 1);
    });
    
    // Restart simulation
    liveSimulation.alpha(1).restart();
    
    // Update positions with animation
    liveSimulation.on('tick', () => {
        liveG.select('g').selectAll('line')
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);
        
        liveG.selectAll('g').filter(function() {
            return this.classList.contains('node');
        }).attr('transform', d => `translate(${d.x},${d.y})`);
    });
}

// Drag functions for live network
function dragStartedLive(event, d) {
    if (!event.active) liveSimulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
    d3.select(event.sourceEvent.target).style('cursor', 'grabbing');
}

function draggedLive(event, d) {
    d.fx = event.x;
    d.fy = event.y;
}

function dragEndedLive(event, d) {
    if (!event.active) liveSimulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
    d3.select(event.sourceEvent.target).style('cursor', 'grab');
}
