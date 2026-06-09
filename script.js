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
let currentFilteredMenu = [];
let cart = [];
let favorites = JSON.parse(localStorage.getItem('chawave_favorites')) || [];
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
    let categories = [...new Set(menuData.map(item => item.Category).filter(Boolean))];
    categories = ['All', '❤️ เมนูโปรด', ...categories]; // Add Favorites category
    const select = document.getElementById('category-select');
    
    if (select) {
        select.innerHTML = categories.map(cat => 
            `<option value="${cat}" ${cat === currentCategory ? 'selected' : ''}>${cat === 'All' ? 'ทั้งหมด' : cat}</option>`
        ).join('');
    }
}

function filterCategory(category) {
    currentCategory = category;
    renderCategories();
    renderMenu();
}

function getFilteredMenu() {
    const searchInput = document.getElementById('search-input');
    const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';
    
    let filtered = [];
    if (currentCategory === '❤️ เมนูโปรด') {
        filtered = menuData.filter(item => favorites.includes(item.Name));
    } else if (currentCategory !== 'All') {
        filtered = menuData.filter(item => item.Category === currentCategory);
    } else {
        filtered = [...menuData]; // Copy to avoid mutating original data
    }
    
    if (searchQuery.length >= 3) {
        filtered = filtered.filter(item => item.Name.toLowerCase().includes(searchQuery));
    }
    
    // เรียงให้เมนูโปรดขึ้นก่อนเสมอ
    filtered.sort((a, b) => {
        const aFav = favorites.includes(a.Name) ? 1 : 0;
        const bFav = favorites.includes(b.Name) ? 1 : 0;
        return bFav - aFav;
    });
    
    return filtered;
}

function renderMenu() {
    const container = document.getElementById('menu-container');
    currentFilteredMenu = getFilteredMenu();
    
    if (currentFilteredMenu.length === 0) {
        container.innerHTML = '<p class="loading">ไม่พบรายการเมนู</p>';
        return;
    }

    container.innerHTML = currentFilteredMenu.map((item, index) => {
        const defaultImg = 'logo.jpg';
        const isFav = favorites.includes(item.Name);
        return `
        <div class="product-card" onclick="openProductModal(${index})">
            <div class="product-img-wrapper">
                <img src="${item.Image || defaultImg}" alt="${item.Name}" class="product-img" onerror="this.src='${defaultImg}'">
                <div class="fav-icon ${isFav ? 'active' : ''}" onclick="toggleFavorite('${item.Name.replace(/'/g, "\\'")}', event)">
                    <i class="${isFav ? 'fas' : 'far'} fa-heart"></i>
                </div>
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

function toggleFavorite(name, event) {
    event.stopPropagation(); // Prevent opening modal
    const index = favorites.indexOf(name);
    if (index > -1) {
        favorites.splice(index, 1);
    } else {
        favorites.push(name);
    }
    localStorage.setItem('chawave_favorites', JSON.stringify(favorites));
    renderMenu(); // Re-render to update heart icons and potentially remove from list if in favorites tab
}

// ==========================================
// ระบบ Modal (ตั้งค่าสินค้าก่อนลงตะกร้า)
// ==========================================
function openProductModal(index) {
    const item = currentFilteredMenu[index];
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
    const deliveryMethodEl = document.querySelector('input[name="delivery_method"]:checked');
    const deliveryMethod = deliveryMethodEl ? deliveryMethodEl.value : '🚶 เข้าไปรับที่ร้าน';
    
    let orderText = "📝 รายการสั่งซื้อ\n";
    if (phoneInput) {
        orderText += `📞 เบอร์ติดต่อ: ${phoneInput}\n`;
    }
    orderText += `📍 การรับสินค้า: ${deliveryMethod}\n`;
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

    // Copy to clipboard as a backup
    navigator.clipboard.writeText(orderText).catch(e => console.log('Clipboard fallback failed', e));

    // ส่งข้อความไปที่ LINE
    // ถ้ามี LINE Official Account ให้ใส่ไอดีตรงนี้ เช่น "@chawave"
    const LINE_OA_ID = "@720cvcjz"; 
    
    let lineUrl = "";
    if (LINE_OA_ID) {
        // ส่งตรงเข้าแชทร้าน
        lineUrl = `https://line.me/R/oaMessage/${LINE_OA_ID}/?${encodeURIComponent(orderText)}`;
    } else {
        // เปิดหน้าส่งข้อความ (ต้องเลือกแชท)
        lineUrl = `https://line.me/R/msg/text/?${encodeURIComponent(orderText)}`;
    }
    
    showToast("กำลังเปิดแชท LINE...");
    
    // หน่วงเวลาเล็กน้อยก่อนเด้งไป LINE
    setTimeout(() => {
        window.location.href = lineUrl;
    }, 500);
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
window.onload = () => {
    initApp();
    
    // ตั้งค่าระบบค้นหา
    const searchInput = document.getElementById('search-input');
    const searchWrapper = document.getElementById('search-wrapper');
    const searchToggleBtn = document.getElementById('search-toggle-btn');
    
    if (searchToggleBtn && searchWrapper && searchInput) {
        searchToggleBtn.addEventListener('click', () => {
            searchWrapper.classList.toggle('active');
            if (searchWrapper.classList.contains('active')) {
                searchInput.focus();
            } else {
                // ถ้าปิดช่องค้นหา ให้ล้างข้อความและโหลดเมนูใหม่
                if (searchInput.value.trim().length > 0) {
                    searchInput.value = '';
                    renderMenu();
                }
            }
        });
        
        searchInput.addEventListener('input', function(e) {
            const val = e.target.value.trim();
            if (val.length >= 3 || val.length === 0) {
                renderMenu();
            }
        });
        
        // ย่อช่องค้นหากลับเมื่อคลิกที่อื่น (ถ้าไม่ได้พิมพ์อะไรไว้)
        document.addEventListener('click', (e) => {
            if (!searchWrapper.contains(e.target) && searchWrapper.classList.contains('active')) {
                if (searchInput.value.trim() === '') {
                    searchWrapper.classList.remove('active');
                }
            }
        });
    }

    // โหลดเบอร์โทรศัพท์จาก LocalStorage
    const phoneInputEl = document.getElementById('customer-phone');
    if (phoneInputEl) {
        const savedPhone = localStorage.getItem('chawave_phone');
        if (savedPhone) {
            phoneInputEl.value = savedPhone;
        }

        // บันทึกเบอร์โทรศัพท์เมื่อมีการพิมพ์
        phoneInputEl.addEventListener('input', function(e) {
            localStorage.setItem('chawave_phone', e.target.value.trim());
        });
    }
};
