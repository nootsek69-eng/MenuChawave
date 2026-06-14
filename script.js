// ==========================================
// การตั้งค่า Google Sheets
// ==========================================
// 1. สร้าง Google Sheets
// 2. ไปที่ ไฟล์ (File) > แชร์ (Share) > เผยแพร่ทางเว็บ (Publish to web)
// 3. เลือกแผ่นงานที่ต้องการ และเลือกรูปแบบเป็น "ค่าที่คั่นด้วยจุลภาค (.csv)"
// 4. นำลิงก์ที่ได้มาวางในตัวแปรด้านล่างนี้
const GOOGLE_SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS7NsP46-2fr6vidSjW2BO6YGkKgdhUXlxuqEBNqpcJ4jrqE9roD-KILJXBa1EHZEDkXhhw5Q8NodZR/pub?gid=0&single=true&output=csv";

// ==========================================
// ลิงก์ Google Apps Script สำหรับรับออเดอร์เข้า POS
// ==========================================
const GOOGLE_SHEETS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbymA0U8_1GWRx7zvZXpNzCiSrdq_HLpU-Dcax1aS9Anb7QDdEqnRXfrt5wZe6tCs8W3/exec"; // วางลิงก์ Web App URL ที่ได้จาก Google Apps Script ที่นี่

// ==========================================
// การตั้งค่าตำแหน่งร้าน (พิกัด ละติจูด, ลองจิจูด)
// ==========================================
// แก้ไขพิกัดตรงนี้ให้ตรงกับตำแหน่งร้านจริง
const STORE_LAT = 14.658342;
const STORE_LNG = 104.221992;
const MAX_DELIVERY_DISTANCE_KM = 5;

// ฟังก์ชันคำนวณระยะทาง (สูตร Haversine)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // รัศมีโลก (กิโลเมตร)
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// ข้อมูลจำลอง (Mock Data) ถูกนำออกแล้วตามความต้องการ

// ==========================================
// ตัวแปรระบบ (State)
// ==========================================
let menuData = [];
let currentFilteredMenu = [];
let cart = JSON.parse(localStorage.getItem('chawave_cart')) || [];
let favorites = JSON.parse(localStorage.getItem('chawave_favorites')) || [];
let currentCategory = 'All';
let currentProduct = null;
let editingCartIndex = -1;

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
            complete: function (results) {
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
    categories = ['All', '❤️ เมนูโปรด', '🕒 ประวัติล่าสุด', ...categories]; // Add Favorites and History
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
    if (currentCategory === '🕒 ประวัติล่าสุด') {
        return []; // handled in renderMenu
    } else if (currentCategory === '❤️ เมนูโปรด') {
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

    if (currentCategory === '🕒 ประวัติล่าสุด') {
        const history = JSON.parse(localStorage.getItem('chawave_history')) || [];
        if (history.length === 0) {
            container.innerHTML = '<p class="loading">ยังไม่มีประวัติการสั่งซื้อ</p>';
            return;
        }

        container.innerHTML = history.map((item, index) => {
            const defaultImg = 'logo.jpg';
            let optionsText = [];
            if (item.selectedType) optionsText.push(item.selectedType);
            if (item.selectedSweetness) optionsText.push(item.selectedSweetness);
            if (item.selectedMilk) optionsText.push(item.selectedMilk);
            if (item.selectedCup) optionsText.push(item.selectedCup);
            if (item.selectedAddons && item.selectedAddons.length > 0) optionsText.push(item.selectedAddons.join(', '));

            return `
            <div class="product-card" onclick="orderHistoryItem(${index})" style="border-color: var(--primary);">
                <div class="product-img-wrapper skeleton-loading">
                    ${item.Promotion ? `<div class="promo-ribbon">${item.Promotion}</div>` : ''}
                    <img src="${item.Image || defaultImg}" alt="${item.Name}" class="product-img" loading="lazy" onload="this.classList.add('loaded'); this.parentElement.classList.remove('skeleton-loading')" onerror="this.src='${defaultImg}'; this.classList.add('loaded'); this.parentElement.classList.remove('skeleton-loading')">
                </div>
                <div class="product-info">
                    <h3 class="product-name">${item.Name}</h3>
                    <div style="font-size: 0.8rem; color: #666; margin-bottom: 5px;">${optionsText.join(' | ')}</div>
                    <div class="product-price">${item.itemTotal / item.quantity} ฿</div>
                    <button class="add-btn" style="width: 100%; margin-top: 5px;" onclick="orderHistoryItem(${index}); event.stopPropagation();"><i class="fas fa-redo"></i> สั่งอีกครั้ง</button>
                </div>
            </div>
            `;
        }).join('');
        return;
    }

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
            <div class="product-img-wrapper skeleton-loading">
                ${item.Promotion ? `<div class="promo-ribbon">${item.Promotion}</div>` : ''}
                <img src="${item.Image || defaultImg}" alt="${item.Name}" class="product-img" loading="lazy" onload="this.classList.add('loaded'); this.parentElement.classList.remove('skeleton-loading')" onerror="this.src='${defaultImg}'; this.classList.add('loaded'); this.parentElement.classList.remove('skeleton-loading')">
                <div class="fav-icon ${isFav ? 'active' : ''}" onclick="toggleFavorite('${item.Name.replace(/'/g, "\\'")}', event)">
                    <i class="${isFav ? 'fas' : 'far'} fa-heart"></i>
                </div>
            </div>
            <div class="product-info">
                <h3 class="product-name">${item.Name}</h3>
                <div class="product-price">${item.Price} ฿</div>
            </div>
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
    editingCartIndex = -1;
    document.getElementById('modal-add-btn').innerHTML = 'เพิ่มลงตะกร้า • <span id="modal-total-price">0</span> ฿';

    const item = currentFilteredMenu[index];
    currentProduct = { ...item, quantity: 1, selectedAddons: [], selectedSauce: [], selectedSweetness: '', selectedMilk: '', selectedType: '', selectedCup: '', note: '' };

    document.getElementById('modal-title').textContent = item.Name;
    document.getElementById('modal-base-price').textContent = `${item.Price} ฿`;
    document.getElementById('modal-img').src = item.Image || 'logo.jpg';
    document.getElementById('modal-img').onerror = function () { this.src = 'logo.jpg'; };
    document.getElementById('modal-quantity').textContent = '1';
    document.getElementById('modal-note').value = '';

    // Dynamic Labels based on Category
    const typeLabel = document.querySelector('#modal-type-container h4');
    const addonsLabel = document.querySelector('#modal-addons-container h4');

    const isDessert = (item.Group === 'ขนม') || (!item.Group && item.Category === 'ขนม');
    if (isDessert) {
        if (typeLabel) typeLabel.innerHTML = '<i class="fas fa-list"></i> รูปแบบ <span class="required">*</span>';
        if (addonsLabel) addonsLabel.innerHTML = '<i class="fas fa-plus-circle"></i> ซอส/ท็อปปิ้ง (Add-ons)';
    } else {
        if (typeLabel) typeLabel.innerHTML = '<i class="fas fa-temperature-half"></i> รูปแบบ (ร้อน/เย็น/ปั่น) <span class="required">*</span>';
        if (addonsLabel) addonsLabel.innerHTML = '<i class="fas fa-plus-circle"></i> เพิ่มท็อปปิ้ง (Add-ons)';
    }

    // Render Cup Option
    const cupContainer = document.getElementById('modal-cup-container');
    const cupDiv = document.getElementById('modal-cup');
    if (item.CupOption) {
        const opts = item.CupOption.split(/[,|]/).map(s => s.trim()).filter(Boolean);
        if (opts.length > 0) {
            cupContainer.style.display = 'block';
            cupDiv.innerHTML = opts.map((opt, i) => `
                <label class="pill-label">
                    <input type="radio" name="cup_option" value="${opt}" ${i === 0 ? 'checked' : ''} onchange="updateModalPrice()">
                    <span class="pill-text">${opt}</span>
                </label>
            `).join('');
            currentProduct.selectedCup = opts[0]; // default
        } else {
            cupContainer.style.display = 'none';
        }
    } else {
        cupContainer.style.display = 'none';
    }

    // Render Sweetness
    const sweetnessContainer = document.getElementById('modal-sweetness-container');
    const sweetnessDiv = document.getElementById('modal-sweetness');
    if (item.Sweetness) {
        // รองรับการคั่นด้วยลูกน้ำ หรือ |
        const opts = item.Sweetness.split(/[,|]/).map(s => s.trim()).filter(Boolean);
        if (opts.length > 0) {
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

    // Render Type
    const typeContainer = document.getElementById('modal-type-container');
    const typeDiv = document.getElementById('modal-type');
    if (item.Type) {
        const opts = item.Type.split(/[,|]/).map(s => s.trim()).filter(Boolean);
        if (opts.length > 0) {
            typeContainer.style.display = 'block';
            typeDiv.innerHTML = opts.map((opt, i) => {
                const parts = opt.split('+');
                let name = opt;
                let price = 0;
                if (parts.length > 1) {
                    name = parts[0].trim();
                    price = parseFloat(parts[1].trim()) || 0;
                }
                const displayName = price > 0 ? `${name} (+${price}฿)` : name;
                return `
                <label class="pill-label">
                    <input type="radio" name="type" value="${name}" data-price="${price}" ${i === 0 ? 'checked' : ''} onchange="updateModalPrice()">
                    <span class="pill-text">${displayName}</span>
                </label>
                `;
            }).join('');
            currentProduct.selectedType = opts[0].split('+')[0].trim(); // default
        } else {
            typeContainer.style.display = 'none';
        }
    } else {
        typeContainer.style.display = 'none';
    }

    // Render Milk
    const milkContainer = document.getElementById('modal-milk-container');
    const milkDiv = document.getElementById('modal-milk');
    if (item.Milk) {
        const opts = item.Milk.split(/[,|]/).map(s => s.trim()).filter(Boolean);
        if (opts.length > 0) {
            milkContainer.style.display = 'block';
            milkDiv.innerHTML = opts.map((opt, i) => {
                const parts = opt.split('+');
                let name = opt;
                let price = 0;
                if (parts.length > 1) {
                    name = parts[0].trim();
                    price = parseFloat(parts[1].trim()) || 0;
                }
                const displayName = price > 0 ? `${name} (+${price}฿)` : name;
                return `
                <label class="pill-label">
                    <input type="radio" name="milk" value="${name}" data-price="${price}" ${i === 0 ? 'checked' : ''} onchange="updateModalPrice()">
                    <span class="pill-text">${displayName}</span>
                </label>
                `;
            }).join('');
            currentProduct.selectedMilk = opts[0].split('+')[0].trim(); // default
        } else {
            milkContainer.style.display = 'none';
        }
    } else {
        milkContainer.style.display = 'none';
    }

    // Render Addons
    const addonsContainer = document.getElementById('modal-addons-container');
    const addonsDiv = document.getElementById('modal-addons');
    if (item.Addons) {
        const opts = item.Addons.split(/[,|]/).map(s => s.trim()).filter(Boolean);
        if (opts.length > 0) {
            addonsContainer.style.display = 'block';
            addonsDiv.innerHTML = opts.map((opt, i) => {
                // Parse "ไข่มุก +10" หรือ "ไข่มุก 10"
                const parts = opt.split('+');
                let name = opt;
                let price = 0;
                if (parts.length > 1) {
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

    // Render Sauce
    const sauceContainer = document.getElementById('modal-sauce-container');
    const sauceDiv = document.getElementById('modal-sauce');
    if (item.Sauce) {
        const opts = item.Sauce.split(/[,|]/).map(s => s.trim()).filter(Boolean);
        if (opts.length > 0) {
            sauceContainer.style.display = 'block';
            sauceDiv.innerHTML = opts.map((opt) => {
                const parts = opt.split('+');
                let name = parts[0].trim();
                let price = parts.length > 1 ? (parseFloat(parts[1].trim()) || 0) : 0;
                return `
                <label class="checkbox-label">
                    <div class="addon-info">
                        <input type="checkbox" name="sauce" value="${name}" data-price="${price}" onchange="updateSauceSelection(); updateModalPrice()">
                        <span>${name}</span>
                    </div>
                    ${price > 0 ? `<span class="addon-price">+${price} ฿</span>` : ''}
                </label>
                `;
            }).join('');
        } else {
            sauceContainer.style.display = 'none';
        }
    } else {
        sauceContainer.style.display = 'none';
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

function editCartItem(index) {
    editingCartIndex = index;
    const item = cart[index];
    currentProduct = JSON.parse(JSON.stringify(item));
    populateModalWithCurrentProduct(true);
}

function orderHistoryItem(index) {
    const history = JSON.parse(localStorage.getItem('chawave_history')) || [];
    const item = history[index];
    if (!item) return;

    // Find base item to verify it still exists
    const baseItemIndex = menuData.findIndex(m => m.Name === item.Name);
    if (baseItemIndex === -1) {
        alert("ไม่พบเมนูนี้ในระบบแล้ว");
        return;
    }

    let productToAdd = JSON.parse(JSON.stringify(item));
    productToAdd.quantity = 1; // Reset quantity to 1
    productToAdd.itemTotal = (parseFloat(productToAdd.Price) || 0) + (productToAdd.addonsPrice || 0);

    addOrMergeCartItem(productToAdd);
    renderCart();
    showToast(`เพิ่ม ${productToAdd.Name} ลงตะกร้าแล้ว`);
}

function populateModalWithCurrentProduct(isEdit) {
    document.getElementById('modal-title').textContent = currentProduct.Name;
    document.getElementById('modal-base-price').textContent = `${currentProduct.Price} ฿`;
    document.getElementById('modal-img').src = currentProduct.Image || 'logo.jpg';
    document.getElementById('modal-img').onerror = function () { this.src = 'logo.jpg'; };
    document.getElementById('modal-quantity').textContent = currentProduct.quantity;
    document.getElementById('modal-note').value = currentProduct.note || '';

    // Dynamic Labels based on Category
    const typeLabel = document.querySelector('#modal-type-container h4');
    const addonsLabel = document.querySelector('#modal-addons-container h4');

    const isDessert = (currentProduct.Group === 'ขนม') || (!currentProduct.Group && currentProduct.Category === 'ขนม');
    if (isDessert) {
        if (typeLabel) typeLabel.innerHTML = '<i class="fas fa-list"></i> รูปแบบ <span class="required">*</span>';
        if (addonsLabel) addonsLabel.innerHTML = '<i class="fas fa-plus-circle"></i> ซอส/ท็อปปิ้ง (Add-ons)';
    } else {
        if (typeLabel) typeLabel.innerHTML = '<i class="fas fa-temperature-half"></i> รูปแบบ (ร้อน/เย็น/ปั่น) <span class="required">*</span>';
        if (addonsLabel) addonsLabel.innerHTML = '<i class="fas fa-plus-circle"></i> เพิ่มท็อปปิ้ง (Add-ons)';
    }

    // Render Cup Option
    const cupContainer = document.getElementById('modal-cup-container');
    const cupDiv = document.getElementById('modal-cup');
    if (currentProduct.CupOption) {
        const opts = currentProduct.CupOption.split(/[,|]/).map(s => s.trim()).filter(Boolean);
        if (opts.length > 0) {
            cupContainer.style.display = 'block';
            cupDiv.innerHTML = opts.map((opt) => {
                const isChecked = currentProduct.selectedCup === opt;
                return `
                <label class="pill-label">
                    <input type="radio" name="cup_option" value="${opt}" ${isChecked ? 'checked' : ''} onchange="updateModalPrice()">
                    <span class="pill-text">${opt}</span>
                </label>
                `;
            }).join('');
        } else {
            cupContainer.style.display = 'none';
        }
    } else {
        cupContainer.style.display = 'none';
    }

    // Render Sweetness
    const sweetnessContainer = document.getElementById('modal-sweetness-container');
    const sweetnessDiv = document.getElementById('modal-sweetness');
    if (currentProduct.Sweetness) {
        const opts = currentProduct.Sweetness.split(/[,|]/).map(s => s.trim()).filter(Boolean);
        if (opts.length > 0) {
            sweetnessContainer.style.display = 'block';
            sweetnessDiv.innerHTML = opts.map((opt) => {
                const isChecked = currentProduct.selectedSweetness === opt;
                return `
                <label class="pill-label">
                    <input type="radio" name="sweetness" value="${opt}" ${isChecked ? 'checked' : ''} onchange="updateModalPrice()">
                    <span class="pill-text">${opt}</span>
                </label>
                `;
            }).join('');
        } else {
            sweetnessContainer.style.display = 'none';
        }
    } else {
        sweetnessContainer.style.display = 'none';
    }

    // Render Type
    const typeContainer = document.getElementById('modal-type-container');
    const typeDiv = document.getElementById('modal-type');
    if (currentProduct.Type) {
        const opts = currentProduct.Type.split(/[,|]/).map(s => s.trim()).filter(Boolean);
        if (opts.length > 0) {
            typeContainer.style.display = 'block';
            typeDiv.innerHTML = opts.map((opt) => {
                const parts = opt.split('+');
                let name = parts[0].trim();
                let price = parts.length > 1 ? (parseFloat(parts[1].trim()) || 0) : 0;
                const displayName = price > 0 ? `${name} (+${price}฿)` : name;
                const isChecked = currentProduct.selectedType === name;
                return `
                <label class="pill-label">
                    <input type="radio" name="type" value="${name}" data-price="${price}" ${isChecked ? 'checked' : ''} onchange="updateModalPrice()">
                    <span class="pill-text">${displayName}</span>
                </label>
                `;
            }).join('');
        } else {
            typeContainer.style.display = 'none';
        }
    } else {
        typeContainer.style.display = 'none';
    }

    // Render Milk
    const milkContainer = document.getElementById('modal-milk-container');
    const milkDiv = document.getElementById('modal-milk');
    if (currentProduct.Milk) {
        const opts = currentProduct.Milk.split(/[,|]/).map(s => s.trim()).filter(Boolean);
        if (opts.length > 0) {
            milkContainer.style.display = 'block';
            milkDiv.innerHTML = opts.map((opt) => {
                const parts = opt.split('+');
                let name = parts[0].trim();
                let price = parts.length > 1 ? (parseFloat(parts[1].trim()) || 0) : 0;
                const displayName = price > 0 ? `${name} (+${price}฿)` : name;
                const isChecked = currentProduct.selectedMilk === name;
                return `
                <label class="pill-label">
                    <input type="radio" name="milk" value="${name}" data-price="${price}" ${isChecked ? 'checked' : ''} onchange="updateModalPrice()">
                    <span class="pill-text">${displayName}</span>
                </label>
                `;
            }).join('');
        } else {
            milkContainer.style.display = 'none';
        }
    } else {
        milkContainer.style.display = 'none';
    }

    // Render Addons
    const addonsContainer = document.getElementById('modal-addons-container');
    const addonsDiv = document.getElementById('modal-addons');
    if (currentProduct.Addons) {
        const opts = currentProduct.Addons.split(/[,|]/).map(s => s.trim()).filter(Boolean);
        if (opts.length > 0) {
            addonsContainer.style.display = 'block';
            addonsDiv.innerHTML = opts.map((opt) => {
                const parts = opt.split('+');
                let name = parts[0].trim();
                let price = parts.length > 1 ? (parseFloat(parts[1].trim()) || 0) : 0;
                const isChecked = currentProduct.selectedAddons && currentProduct.selectedAddons.includes(name);
                return `
                <label class="checkbox-label">
                    <div class="addon-info">
                        <input type="checkbox" value="${name}" data-price="${price}" onchange="updateModalPrice()" ${isChecked ? 'checked' : ''}>
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

    // Render Sauce
    const sauceContainer = document.getElementById('modal-sauce-container');
    const sauceDiv = document.getElementById('modal-sauce');
    if (currentProduct.Sauce) {
        const opts = currentProduct.Sauce.split(/[,|]/).map(s => s.trim()).filter(Boolean);
        if (opts.length > 0) {
            sauceContainer.style.display = 'block';
            sauceDiv.innerHTML = opts.map((opt) => {
                const parts = opt.split('+');
                let name = parts[0].trim();
                let price = parts.length > 1 ? (parseFloat(parts[1].trim()) || 0) : 0;
                const isChecked = currentProduct.selectedSauce && currentProduct.selectedSauce.includes(name);
                return `
                <label class="checkbox-label">
                    <div class="addon-info">
                        <input type="checkbox" name="sauce" value="${name}" data-price="${price}" onchange="updateSauceSelection(); updateModalPrice()" ${isChecked ? 'checked' : ''}>
                        <span>${name}</span>
                    </div>
                    ${price > 0 ? `<span class="addon-price">+${price} ฿</span>` : ''}
                </label>
                `;
            }).join('');
            setTimeout(updateSauceSelection, 0);
        } else {
            sauceContainer.style.display = 'none';
        }
    } else {
        sauceContainer.style.display = 'none';
    }

    document.getElementById('modal-add-btn').innerHTML = isEdit ? 'บันทึกการแก้ไข • <span id="modal-total-price">0</span> ฿' : 'เพิ่มลงตะกร้า • <span id="modal-total-price">0</span> ฿';

    updateModalPrice();
    document.getElementById('product-modal').classList.add('active');
}

function changeQuantity(delta) {
    let q = currentProduct.quantity + delta;
    if (q >= 1) {
        currentProduct.quantity = q;
        document.getElementById('modal-quantity').textContent = q;
        updateModalPrice();
    }
}

function updateSauceSelection() {
    const checked = document.querySelectorAll('#modal-sauce input[type="checkbox"]:checked');
    const checkboxes = document.querySelectorAll('#modal-sauce input[type="checkbox"]');
    if (checked.length >= 2) {
        checkboxes.forEach(cb => {
            if (!cb.checked) cb.disabled = true;
        });
    } else {
        checkboxes.forEach(cb => cb.disabled = false);
    }
}

function updateModalPrice() {
    let basePrice = parseFloat(currentProduct.Price) || 0;
    let addonsPrice = 0;

    // Check Sauce
    const sauceCheckboxes = document.querySelectorAll('#modal-sauce input[type="checkbox"]:checked');
    sauceCheckboxes.forEach(cb => {
        addonsPrice += parseFloat(cb.dataset.price) || 0;
    });

    // Check Addons
    const checkboxes = document.querySelectorAll('#modal-addons input[type="checkbox"]:checked');
    checkboxes.forEach(cb => {
        addonsPrice += parseFloat(cb.dataset.price) || 0;
    });

    // Check Milk Price
    const selectedMilkEl = document.querySelector('input[name="milk"]:checked');
    if (selectedMilkEl && document.getElementById('modal-milk-container').style.display !== 'none') {
        addonsPrice += parseFloat(selectedMilkEl.dataset.price) || 0;
    }

    // Check Type Price
    const selectedTypeEl = document.querySelector('input[name="type"]:checked');
    if (selectedTypeEl && document.getElementById('modal-type-container').style.display !== 'none') {
        addonsPrice += parseFloat(selectedTypeEl.dataset.price) || 0;
    }

    let total = (basePrice + addonsPrice) * currentProduct.quantity;
    document.getElementById('modal-total-price').textContent = total;
}

// ==========================================
// ระบบตะกร้าสินค้า (Cart)
// ==========================================
function addOrMergeCartItem(product) {
    const existingIndex = cart.findIndex(item =>
        item.Name === product.Name &&
        item.selectedType === product.selectedType &&
        item.selectedSweetness === product.selectedSweetness &&
        item.selectedMilk === product.selectedMilk &&
        item.selectedCup === product.selectedCup &&
        JSON.stringify(item.selectedAddons || []) === JSON.stringify(product.selectedAddons || []) &&
        JSON.stringify(item.selectedSauce || []) === JSON.stringify(product.selectedSauce || []) &&
        item.note === product.note
    );

    if (existingIndex > -1) {
        cart[existingIndex].quantity += product.quantity;
        const basePrice = parseFloat(cart[existingIndex].Price) || 0;
        cart[existingIndex].itemTotal = (basePrice + (cart[existingIndex].addonsPrice || 0)) * cart[existingIndex].quantity;
    } else {
        cart.push(JSON.parse(JSON.stringify(product)));
    }
}
function addToCart() {
    // Get Sweetness
    const selectedSweetnessEl = document.querySelector('input[name="sweetness"]:checked');
    if (selectedSweetnessEl && document.getElementById('modal-sweetness-container').style.display !== 'none') {
        currentProduct.selectedSweetness = selectedSweetnessEl.value;
    } else {
        currentProduct.selectedSweetness = '';
    }

    // Get Type
    const selectedTypeEl = document.querySelector('input[name="type"]:checked');
    let typePrice = 0;
    if (selectedTypeEl && document.getElementById('modal-type-container').style.display !== 'none') {
        currentProduct.selectedType = selectedTypeEl.value;
        typePrice = parseFloat(selectedTypeEl.dataset.price) || 0;
    } else {
        currentProduct.selectedType = '';
    }

    // Get Milk
    const selectedMilkEl = document.querySelector('input[name="milk"]:checked');
    let milkPrice = 0;
    if (selectedMilkEl && document.getElementById('modal-milk-container').style.display !== 'none') {
        currentProduct.selectedMilk = selectedMilkEl.value;
        milkPrice = parseFloat(selectedMilkEl.dataset.price) || 0;
    } else {
        currentProduct.selectedMilk = '';
    }

    // Get Cup Option
    const selectedCupEl = document.querySelector('input[name="cup_option"]:checked');
    if (selectedCupEl && document.getElementById('modal-cup-container').style.display !== 'none') {
        currentProduct.selectedCup = selectedCupEl.value;
    } else {
        currentProduct.selectedCup = '';
    }

    // Get Addons
    const addons = [];
    let addonsTotalPrice = 0;
    document.querySelectorAll('#modal-addons input[type="checkbox"]:checked').forEach(cb => {
        addons.push(cb.value);
        addonsTotalPrice += parseFloat(cb.dataset.price) || 0;
    });
    currentProduct.selectedAddons = addons;

    // Get Sauce
    const sauce = [];
    let sauceTotalPrice = 0;
    document.querySelectorAll('#modal-sauce input[type="checkbox"]:checked').forEach(cb => {
        sauce.push(cb.value);
        sauceTotalPrice += parseFloat(cb.dataset.price) || 0;
    });

    if (document.getElementById('modal-sauce-container').style.display !== 'none') {
        if (sauce.length === 0) {
            alert('กรุณาเลือกซอสอย่างน้อย 1 อย่าง (เลือกได้สูงสุด 2 อย่าง)');
            return;
        }
    }

    currentProduct.selectedSauce = sauce;
    currentProduct.addonsPrice = addonsTotalPrice + sauceTotalPrice + milkPrice + typePrice;

    // Get Note
    currentProduct.note = document.getElementById('modal-note').value.trim();

    // Calculate Item Total
    const basePrice = parseFloat(currentProduct.Price) || 0;
    currentProduct.itemTotal = (basePrice + currentProduct.addonsPrice) * currentProduct.quantity;

    // Add or Update Cart
    if (editingCartIndex > -1) {
        cart[editingCartIndex] = JSON.parse(JSON.stringify(currentProduct));
        editingCartIndex = -1; // reset
    } else {
        addOrMergeCartItem(currentProduct);
    }

    closeModal();
    renderCart();

    // Open cart automatically on mobile (ปิดไว้ตามคำขอ)
    // if(window.innerWidth < 768) {
    //     document.getElementById('cart-panel').classList.remove('collapsed');
    // }
}

function removeFromCart(index) {
    cart.splice(index, 1);
    renderCart();
}

function renderCart() {
    localStorage.setItem('chawave_cart', JSON.stringify(cart));
    const cartCount = document.getElementById('cart-count');
    const cartItems = document.getElementById('cart-items');
    const cartTotalPrice = document.getElementById('cart-total-price');
    const copyBtn = document.getElementById('copy-btn');

    let totalItems = 0;
    let totalPrice = 0;

    if (cart.length === 0) {
        cartItems.innerHTML = `
            <div class="empty-cart">
                <i class="fas fa-glass-water"></i>
                <p>ยังไม่มีรายการในตะกร้า</p>
            </div>`;
        cartCount.textContent = '0';
        cartCount.style.color = '';
        cartCount.style.fontWeight = '';
        cartTotalPrice.textContent = '0';
        copyBtn.disabled = true;
        return;
    }

    cartItems.innerHTML = cart.map((item, index) => {
        totalItems += item.quantity;
        totalPrice += item.itemTotal;

        let optionsText = [];
        if (item.selectedType) optionsText.push(`รูปแบบ: ${item.selectedType}`);
        if (item.selectedSweetness) optionsText.push(`ความหวาน: ${item.selectedSweetness}`);
        if (item.selectedMilk) optionsText.push(`นม: ${item.selectedMilk}`);
        if (item.selectedCup) optionsText.push(`การรับ: ${item.selectedCup}`);
        if (item.selectedSauce && item.selectedSauce.length > 0) optionsText.push(`ซอส: ${item.selectedSauce.join(', ')}`);
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
                <div class="action-buttons" style="display: flex; gap: 0.75rem; align-items: center;">
                    <button class="edit-btn" onclick="editCartItem(${index})"><i class="fas fa-edit"></i> แก้ไข</button>
                    <button class="remove-btn" onclick="removeFromCart(${index})"><i class="fas fa-trash-alt"></i> ลบ</button>
                </div>
            </div>
        </div>
        `;
    }).join('');

    cartCount.textContent = totalItems;
    if (totalItems > 0) {
        cartCount.style.color = '#EF4444';
        cartCount.style.fontWeight = 'bold';
    } else {
        cartCount.style.color = '';
        cartCount.style.fontWeight = '';
    }
    cartTotalPrice.textContent = totalPrice;
    copyBtn.disabled = false;
}

function toggleCart() {
    const cartPanel = document.getElementById('cart-panel');
    if (cartPanel) {
        cartPanel.classList.toggle('collapsed');
        document.body.classList.toggle('cart-collapsed', cartPanel.classList.contains('collapsed'));
    }
}

// ==========================================
// ระบบคัดลอกข้อความ (Clipboard)
// ==========================================
function copyOrder() {
    if (cart.length === 0) return;

    const phoneInput = document.getElementById('customer-phone').value.trim();

    // ตรวจสอบเบอร์โทรศัพท์สำหรับสะสมแต้ม
    if (!phoneInput) {
        document.getElementById('confirm-modal').classList.add('active');
        return; // รอให้ผู้ใช้กดปุ่มใน Modal
    }

    proceedWithOrder();
}

function closeConfirmModal() {
    document.getElementById('confirm-modal').classList.remove('active');
}

function proceedWithOrder() {
    closeConfirmModal(); // ปิด Modal (ถ้าเปิดอยู่)

    // บันทึกประวัติการสั่งซื้อ (เก็บสูงสุด 10 รายการล่าสุด)
    if (cart.length > 0) {
        let history = JSON.parse(localStorage.getItem('chawave_history')) || [];
        for (let i = cart.length - 1; i >= 0; i--) {
            history.unshift(cart[i]);
        }
        history = history.slice(0, 10);
        localStorage.setItem('chawave_history', JSON.stringify(history));
    }

    const phoneInput = document.getElementById('customer-phone').value.trim();
    const deliveryMethodEl = document.querySelector('input[name="delivery_method"]:checked');
    const deliveryMethod = deliveryMethodEl ? deliveryMethodEl.value : '🚶 เข้าไปรับที่ร้าน';

    // ฟังก์ชันช่วยหาค่าราคาของตัวเลือกเพื่อแสดงผล
    const getOptionPrice = (defString, selectedName) => {
        if (!selectedName || !defString) return 0;
        const opts = defString.split(/[,|]/);
        for (let opt of opts) {
            const parts = opt.split('+');
            const name = parts[0].trim();
            if (name === selectedName) {
                return parts.length > 1 ? (parseFloat(parts[1].trim()) || 0) : 0;
            }
        }
        return 0;
    };

    const getOptionDisplay = (defString, selectedName) => {
        if (!selectedName) return "";
        const price = getOptionPrice(defString, selectedName);
        return price > 0 ? `${selectedName} (+${price}฿)` : selectedName;
    };

    const getOptionWithPricePayload = (defString, selectedName) => {
        if (!selectedName) return "";
        const price = getOptionPrice(defString, selectedName);
        return price > 0 ? `${selectedName} +${price}` : selectedName;
    };

    let orderText = "📝 รายการสั่งซื้อ\n";
    if (phoneInput) {
        orderText += `📞 เบอร์ติดต่อ: ${phoneInput}\n`;
    }
    orderText += `📍 การรับสินค้า: ${deliveryMethod}\n`;
    if (deliveryMethod === '🛵 ส่งปลายทาง' && userLocationUrl) {
        orderText += `📌 แผนที่จัดส่ง: ${userLocationUrl}\n`;
    }
    orderText += "------------------------\n";

    let grandTotal = 0;

    cart.forEach(item => {
        let line = `${item.quantity}x ${item.Name}`;
        grandTotal += item.itemTotal;

        let details = [];
        if (item.selectedType) {
            details.push(getOptionDisplay(item.Type, item.selectedType));
        }
        if (item.selectedSweetness) {
            details.push(item.selectedSweetness);
        }
        if (item.selectedMilk) {
            details.push(getOptionDisplay(item.Milk, item.selectedMilk));
        }
        if (item.selectedCup) {
            details.push(item.selectedCup);
        }
        if (item.selectedSauce && item.selectedSauce.length > 0) {
            const sauceDisplay = item.selectedSauce.map(name => getOptionDisplay(item.Sauce, name));
            details.push(`ซอส: ${sauceDisplay.join(', ')}`);
        }
        if (item.selectedAddons && item.selectedAddons.length > 0) {
            const addonsDisplay = item.selectedAddons.map(name => getOptionDisplay(item.Addons, name));
            details.push(`เพิ่ม: ${addonsDisplay.join(', ')}`);
        }
        if (item.note) {
            details.push(`หมายเหตุ: ${item.note}`);
        }

        if (details.length > 0) {
            line += ` (${details.join(' | ')})`;
        }

        line += `\n`;
        orderText += line;
    });

    orderText += "------------------------\n";
    orderText += `💰 ราคารวมทั้งหมด: ${grandTotal} ฿\n`;

    // Copy to clipboard as a backup
    navigator.clipboard.writeText(orderText).catch(e => console.log('Clipboard fallback failed', e));

    // ส่งข้อมูลเข้า Google Sheets
    if (typeof GOOGLE_SHEETS_SCRIPT_URL !== 'undefined' && GOOGLE_SHEETS_SCRIPT_URL && GOOGLE_SHEETS_SCRIPT_URL.startsWith("https://script.google.com")) {
        const orderPayload = {
            action: 'create_web_order',
            phone: phoneInput,
            delivery: deliveryMethod,
            locationUrl: userLocationUrl,
            items: cart.map(item => {
                const typeWithPrice = getOptionWithPricePayload(item.Type, item.selectedType);
                const milkWithPrice = getOptionWithPricePayload(item.Milk, item.selectedMilk);
                const addonsWithPrices = (item.selectedAddons || []).map(name => getOptionWithPricePayload(item.Addons, name));
                const sauceWithPrices = (item.selectedSauce || []).map(name => getOptionWithPricePayload(item.Sauce, name));

                return {
                    name: item.Name,
                    quantity: item.quantity,
                    type: typeWithPrice,
                    sweetness: item.selectedSweetness || "",
                    milk: milkWithPrice,
                    cup: item.selectedCup || "",
                    addons: addonsWithPrices,
                    sauce: sauceWithPrices,
                    note: item.note || ""
                };
            })
        };

        fetch(GOOGLE_SHEETS_SCRIPT_URL, {
            method: 'POST',
            mode: 'cors',
            cache: 'no-cache',
            keepalive: true, // ป้องกันการยกเลิก request เมื่อเบราว์เซอร์เปิดไปที่หน้า LINE ทันที
            headers: {
                'Content-Type': 'text/plain'
            },
            body: JSON.stringify(orderPayload)
        }).catch(err => console.error("Error sending order to Sheets:", err));
    }

    // ส่งข้อความไปที่ LINE
    // ใช้ oaMessage เพื่อเข้าแชทร้านโดยตรง
    const LINE_OA_ID = "@720cvcjz";
    const lineUrl = `https://line.me/R/oaMessage/${LINE_OA_ID}/?${encodeURIComponent(orderText)}`;

    showToast("คัดลอกแล้ว! กรุณากด 'วาง' ในแชทเพื่อส่ง");

    // เคลียร์ตะกร้าเมื่อส่งสำเร็จ
    cart = [];
    renderCart();

    // เปิด LINE ทันที (ไม่ใช้ setTimeout เพื่อป้องกันเบราว์เซอร์บล็อกการเปลี่ยนหน้าเว็บ)
    window.location.href = lineUrl;
}

function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}

// ==========================================
// ระบบระบุตำแหน่งที่อยู่ (Geolocation)
// ==========================================
let userLocationUrl = '';

function toggleLocation(show) {
    document.getElementById('location-section').style.display = show ? 'block' : 'none';
    if (show) {
        getLocation();
    } else {
        userLocationUrl = ''; // เคลียร์ถ้ากลับไปรับที่ร้าน
    }
}

function getLocation() {
    const status = document.getElementById('location-status');
    const btn = document.getElementById('get-location-btn');

    if (!navigator.geolocation) {
        status.textContent = "เบราว์เซอร์ของคุณไม่รองรับการดึงตำแหน่ง";
        status.style.color = "red";
        btn.style.display = 'block';
        return;
    }

    status.textContent = "กำลังค้นหาตำแหน่งของคุณ...";
    status.style.color = "var(--text-muted)";
    btn.style.display = 'none'; // ซ่อนปุ่มระหว่างค้นหา
    btn.disabled = true;

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            const distance = calculateDistance(STORE_LAT, STORE_LNG, lat, lng);

            if (distance > MAX_DELIVERY_DISTANCE_KM) {
                status.innerHTML = `<i class="fas fa-times-circle"></i> อยู่นอกระยะให้บริการ (${distance.toFixed(1)} กม.) รองรับไม่เกิน ${MAX_DELIVERY_DISTANCE_KM} กม.`;
                status.style.color = "red";
                btn.style.display = 'block'; // แสดงปุ่มให้ลองใหม่
                btn.disabled = false;
                userLocationUrl = '';
            } else {
                userLocationUrl = `https://maps.google.com/?q=${lat},${lng}`;
                status.innerHTML = `<i class="fas fa-check-circle"></i> ดึงตำแหน่งสำเร็จ! ระยะทาง ${distance.toFixed(1)} กม.`;
                status.style.color = "#10B981";
                btn.style.display = 'none'; // ซ่อนปุ่มถาวรถ้าสำเร็จ
                btn.disabled = false;
            }
        },
        (error) => {
            let msg = "ไม่สามารถดึงตำแหน่งได้";
            if (error.code === 1) msg = "กรุณาอนุญาตการเข้าถึงตำแหน่งที่ตั้ง";
            status.textContent = msg;
            status.style.color = "red";
            btn.style.display = 'block'; // แสดงปุ่มให้ลองใหม่
            btn.disabled = false;
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

// เริ่มต้นทำงาน
window.onload = () => {
    initApp();
    renderCart(); // โหลดตะกร้าที่บันทึกไว้

    // ซิงค์สถานะตัวย่อตะกร้ากับ body สำหรับการจัด layout บนคอม
    const cartPanel = document.getElementById('cart-panel');
    if (cartPanel && cartPanel.classList.contains('collapsed')) {
        document.body.classList.add('cart-collapsed');
    }

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

        searchInput.addEventListener('input', function (e) {
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
        phoneInputEl.addEventListener('input', function (e) {
            localStorage.setItem('chawave_phone', e.target.value.trim());
        });
    }
};
