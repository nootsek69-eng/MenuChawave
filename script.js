// ==========================================
// การตั้งค่า Google Sheets
// ==========================================
// 1. สร้าง Google Sheets
// 2. ไปที่ ไฟล์ (File) > แชร์ (Share) > เผยแพร่ทางเว็บ (Publish to web)
// 3. เลือกแผ่นงานที่ต้องการ และเลือกรูปแบบเป็น "ค่าที่คั่นด้วยจุลภาค (.csv)"
// 4. นำลิงก์ที่ได้มาวางในตัวแปรด้านล่างนี้
const GOOGLE_SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS7NsP46-2fr6vidSjW2BO6YGkKgdhUXlxuqEBNqpcJ4jrqE9roD-KILJXBa1EHZEDkXhhw5Q8NodZR/pub?gid=0&single=true&output=csv"; 

// ข้อมูลจำลอง (Mock Data) ถูกนำออกแล้วตามความต้องการ

// ==========================================
// ตัวแปรระบบ (State)
// ==========================================
let menuData = [];
let cart = [];
let currentCategory = 'All';
let currentProduct = null;

// ==========================================
// การดึงข้อมูล (Fetch Data)
// ==========================================
async function initApp() {
    try {
        let csvString = "";

        if (GOOGLE_SHEETS_CSV_URL) {
            try {
                // Try fetching directly first
                const response = await fetch(GOOGLE_SHEETS_CSV_URL);
                if (!response.ok) throw new Error("Network response was not ok");
                csvString = await response.text();
            } catch (err) {
                console.warn("Direct fetch failed (CORS issue), trying proxy...", err);
                try {
                    // Fallback to corsproxy.io
                    const proxyUrl = "https://corsproxy.io/?" + encodeURIComponent(GOOGLE_SHEETS_CSV_URL);
                    const response = await fetch(proxyUrl);
                    if (!response.ok) throw new Error("Proxy failed");
                    csvString = await response.text();
                } catch (err2) {
                    throw new Error("Failed to fetch data from both direct and proxy URLs.");
                }
            }
        } else {
            throw new Error("ไม่มีลิงก์ Google Sheets");
        }

        // แปลง CSV เป็น JSON
        Papa.parse(csvString, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                menuData = results.data;
                renderCategories();
                renderMenu();
            }
        });
    } catch (error) {
        console.error("Error fetching data:", error);
        document.getElementById('menu-container').innerHTML = '<p class="loading">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>';
    }
}

// ==========================================
// การแสดงผลเมนู (Render UI)
// ==========================================
function renderCategories() {
    const categories = ['All', ...new Set(menuData.map(item => item.Category).filter(Boolean))];
    const nav = document.getElementById('category-nav');
    
    nav.innerHTML = categories.map(cat => 
        `<button class="cat-btn ${cat === currentCategory ? 'active' : ''}" onclick="filterCategory('${cat}')">${cat === 'All' ? 'ทั้งหมด' : cat}</button>`
    ).join('');
}

function filterCategory(category) {
    currentCategory = category;
    renderCategories();
    renderMenu();
}

function renderMenu() {
    const container = document.getElementById('menu-container');
    const filteredMenu = currentCategory === 'All' ? menuData : menuData.filter(item => item.Category === currentCategory);
    
    if (filteredMenu.length === 0) {
        container.innerHTML = '<p class="loading">ไม่พบรายการเมนู</p>';
        return;
    }

    container.innerHTML = filteredMenu.map((item, index) => {
        const defaultImg = 'logo.jpg';
        return `
        <div class="product-card" onclick="openProductModal(${index})">
            <div class="product-img-wrapper">
                <img src="${item.Image || defaultImg}" alt="${item.Name}" class="product-img" onerror="this.src='${defaultImg}'">
            </div>
            <div class="product-info">
                <h3 class="product-name">${item.Name}</h3>
                <div class="product-price">${item.Price} ฿</div>
            </div>
            <div class="add-icon"><i class="fas fa-plus"></i></div>
        </div>
        `;
    }).join('');
}

// ==========================================
// ระบบ Modal (ตั้งค่าสินค้าก่อนลงตะกร้า)
// ==========================================
function openProductModal(index) {
    const item = currentCategory === 'All' ? menuData[index] : menuData.filter(i => i.Category === currentCategory)[index];
    currentProduct = { ...item, quantity: 1, selectedAddons: [], selectedSweetness: '', note: '' };
    
    document.getElementById('modal-title').textContent = item.Name;
    document.getElementById('modal-base-price').textContent = `${item.Price} ฿`;
    document.getElementById('modal-img').src = item.Image || 'logo.jpg';
    document.getElementById('modal-img').onerror = function() { this.src = 'logo.jpg'; };
    document.getElementById('modal-quantity').textContent = '1';
    document.getElementById('modal-note').value = '';

    // Render Sweetness
    const sweetnessContainer = document.getElementById('modal-sweetness-container');
    const sweetnessDiv = document.getElementById('modal-sweetness');
    if (item.Sweetness) {
        // รองรับการคั่นด้วยลูกน้ำ หรือ |
        const opts = item.Sweetness.split(/[,|]/).map(s => s.trim()).filter(Boolean);
        if(opts.length > 0) {
            sweetnessContainer.style.display = 'block';
            sweetnessDiv.innerHTML = opts.map((opt, i) => `
                <label class="pill-label">
                    <input type="radio" name="sweetness" value="${opt}" ${i === 0 ? 'checked' : ''} onchange="updateModalPrice()">
                    <span class="pill-text">${opt}</span>
                </label>
            `).join('');
            currentProduct.selectedSweetness = opts[0]; // default
        } else {
            sweetnessContainer.style.display = 'none';
        }
    } else {
        sweetnessContainer.style.display = 'none';
    }

    // Render Addons
    const addonsContainer = document.getElementById('modal-addons-container');
    const addonsDiv = document.getElementById('modal-addons');
    if (item.Addons) {
        const opts = item.Addons.split(/[,|]/).map(s => s.trim()).filter(Boolean);
        if(opts.length > 0) {
            addonsContainer.style.display = 'block';
            addonsDiv.innerHTML = opts.map((opt, i) => {
                // Parse "ไข่มุก +10" หรือ "ไข่มุก 10"
                const parts = opt.split('+');
                let name = opt;
                let price = 0;
                if(parts.length > 1) {
                    name = parts[0].trim();
                    price = parseFloat(parts[1].trim()) || 0;
                }
                
                return `
                <label class="checkbox-label">
                    <div class="addon-info">
                        <input type="checkbox" value="${name}" data-price="${price}" onchange="updateModalPrice()">
                        <span>${name}</span>
                    </div>
                    ${price > 0 ? `<span class="addon-price">+${price} ฿</span>` : ''}
                </label>
                `;
            }).join('');
        } else {
            addonsContainer.style.display = 'none';
        }
    } else {
        addonsContainer.style.display = 'none';
    }

    updateModalPrice();
    document.getElementById('product-modal').classList.add('active');
}

function closeModal() {
    document.getElementById('product-modal').classList.remove('active');
}

function closeModalOnOutsideClick(event) {
    if (event.target.id === 'product-modal') {
        closeModal();
    }
}

function changeQuantity(delta) {
    let q = currentProduct.quantity + delta;
    if (q >= 1) {
        currentProduct.quantity = q;
        document.getElementById('modal-quantity').textContent = q;
        updateModalPrice();
    }
}

function updateModalPrice() {
    let basePrice = parseFloat(currentProduct.Price) || 0;
    let addonsPrice = 0;
    
    // Check Addons
    const checkboxes = document.querySelectorAll('#modal-addons input[type="checkbox"]:checked');
    checkboxes.forEach(cb => {
        addonsPrice += parseFloat(cb.dataset.price) || 0;
    });
    
    let total = (basePrice + addonsPrice) * currentProduct.quantity;
    document.getElementById('modal-total-price').textContent = total;
}

// ==========================================
// ระบบตะกร้าสินค้า (Cart)
// ==========================================
function addToCart() {
    // Get Sweetness
    const selectedSweetnessEl = document.querySelector('input[name="sweetness"]:checked');
    if (selectedSweetnessEl && document.getElementById('modal-sweetness-container').style.display !== 'none') {
        currentProduct.selectedSweetness = selectedSweetnessEl.value;
    } else {
        currentProduct.selectedSweetness = '';
    }

    // Get Addons
    const addons = [];
    let addonsTotalPrice = 0;
    document.querySelectorAll('#modal-addons input[type="checkbox"]:checked').forEach(cb => {
        addons.push(cb.value);
        addonsTotalPrice += parseFloat(cb.dataset.price) || 0;
    });
    currentProduct.selectedAddons = addons;
    currentProduct.addonsPrice = addonsTotalPrice;

    // Get Note
    currentProduct.note = document.getElementById('modal-note').value.trim();

    // Calculate Item Total
    const basePrice = parseFloat(currentProduct.Price) || 0;
    currentProduct.itemTotal = (basePrice + addonsTotalPrice) * currentProduct.quantity;

    // Add to Cart
    cart.push(JSON.parse(JSON.stringify(currentProduct)));
    
    closeModal();
    renderCart();
    
    // Open cart automatically on mobile
    if(window.innerWidth < 768) {
        document.getElementById('cart-panel').classList.remove('collapsed');
    }
}

function removeFromCart(index) {
    cart.splice(index, 1);
    renderCart();
}

function renderCart() {
    const cartCount = document.getElementById('cart-count');
    const cartItems = document.getElementById('cart-items');
    const cartTotalPrice = document.getElementById('cart-total-price');
    const copyBtn = document.getElementById('copy-btn');

    let totalItems = 0;
    let totalPrice = 0;

    if (cart.length === 0) {
        cartItems.innerHTML = `
            <div class="empty-cart">
                <i class="fas fa-utensils"></i>
                <p>ยังไม่มีรายการในตะกร้า</p>
            </div>`;
        cartCount.textContent = '0';
        cartTotalPrice.textContent = '0';
        copyBtn.disabled = true;
        return;
    }

    cartItems.innerHTML = cart.map((item, index) => {
        totalItems += item.quantity;
        totalPrice += item.itemTotal;
        
        let optionsText = [];
        if (item.selectedSweetness) optionsText.push(`ความหวาน: ${item.selectedSweetness}`);
        if (item.selectedAddons.length > 0) optionsText.push(`เพิ่ม: ${item.selectedAddons.join(', ')}`);
        
        return `
        <div class="cart-item">
            <div class="item-details">
                <div class="item-title">
                    <span class="item-qty">${item.quantity}x</span> 
                    ${item.Name}
                </div>
                ${optionsText.length > 0 ? `<div class="item-options">${optionsText.join(' | ')}</div>` : ''}
                ${item.note ? `<div class="item-note">"${item.note}"</div>` : ''}
            </div>
            <div class="item-price-remove">
                <div class="item-total">${item.itemTotal} ฿</div>
                <button class="remove-btn" onclick="removeFromCart(${index})"><i class="fas fa-trash-alt"></i> ลบ</button>
            </div>
        </div>
        `;
    }).join('');

    cartCount.textContent = totalItems;
    cartTotalPrice.textContent = totalPrice;
    copyBtn.disabled = false;
}

function toggleCart() {
    if(window.innerWidth < 768) {
        document.getElementById('cart-panel').classList.toggle('collapsed');
    }
}

// ==========================================
// ระบบคัดลอกข้อความ (Clipboard)
// ==========================================
function copyOrder() {
    if (cart.length === 0) return;

    const phoneInput = document.getElementById('customer-phone').value.trim();
    
    let orderText = "📝 รายการสั่งซื้อ\n";
    if (phoneInput) {
        orderText += `📞 เบอร์ติดต่อ: ${phoneInput}\n`;
    }
    orderText += "------------------------\n";
    
    cart.forEach(item => {
        let line = `${item.quantity}x ${item.Name}`;
        
        let details = [];
        if(item.selectedSweetness) details.push(item.selectedSweetness);
        if(item.selectedAddons.length > 0) details.push(item.selectedAddons.join(', '));
        if(item.note) details.push(`หมายเหตุ: ${item.note}`);
        
        if(details.length > 0) {
            line += ` (${details.join(' | ')})`;
        }
        
        line += `\n`;
        orderText += line;
    });

    orderText += "------------------------\n";

    // Copy to clipboard
    navigator.clipboard.writeText(orderText).then(() => {
        showToast("คัดลอกรายการสั่งซื้อแล้ว! นำไปวางในแชทได้เลย");
    }).catch(err => {
        console.error('Could not copy text: ', err);
        // Fallback for older browsers
        const textArea = document.createElement("textarea");
        textArea.value = orderText;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("Copy");
        textArea.remove();
        showToast("คัดลอกรายการสั่งซื้อแล้ว!");
    });
}

function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}

// เริ่มต้นทำงาน
window.onload = initApp;
