# IT Management Interface

A web-based inventory management system for tracking IT devices, network infrastructure, and equipment across multiple sites (WTC and HLS).

## 🚀 Overview

The IT Management Interface is a device inventory management system built with HTML, CSS, and JavaScript, integrated with Firebase Firestore for real-time data storage. It manages IT assets including computers, monitors, network interfaces, and software licenses.

---

## ✨ Key Features

### 🔐 Authentication & Multi-Site Support
- Secure login with username/password
- Multi-site support: WTC (Wijeya Television Corporation) and HLS (Hiru Live Streaming)
- Site-specific data isolation
- First-time login password change

### 📊 Device Management
- Track PC details (model, serial number, specifications)
- Manage multiple network interfaces per device with IP addresses
- Track multiple monitors per device
- Manage software licenses with expiry dates and keys
- Hardware specifications: CPU, GPU, RAM, Storage

### 📈 Dashboard & Analytics
- Real-time statistics:
  - Total devices
  - Active devices
  - Failed devices
  - Replaced devices
- Department-wise filtering
- Search functionality

### 🔧 Device Lifecycle
- **Add New Devices**: Comprehensive form with all device details
- **Edit Devices**: Full editing capabilities
- **Delete Devices**: Secure deletion with confirmation
- **Report Failures**: Track device failures with priority levels
- **Mark as Fixed**: Record repair history
- **Replace Devices**: Complete replacement workflow

### 📁 Excel Integration
- Export to Excel (all devices, active only, or failed only)
- Import from Excel (bulk import with validation)
- Download import template
- Real-time import progress tracking

### 📝 Activity Logging
- Comprehensive logging for all actions
- Searchable and filterable logs
- Export logs to Excel
- Sri Lanka timezone support

### 🌐 Network Diagram
- Direct links to network infrastructure diagrams
- Site-specific network topology
- External Canva integration

### 🎨 User Interface
- Modern, responsive design
- Animated login page
- Collapsible sidebar
- Firebase connection status indicator
- Mobile-responsive layout

---

## 🛠️ Technology Stack

**Frontend:**
- HTML5
- CSS3 (Custom styling with animations)
- JavaScript (ES6+)

**Backend & Database:**
- Firebase Firestore (NoSQL database)
- Firebase Authentication

**Libraries:**
- Font Awesome 6.4.0 (Icons)
- SheetJS/xlsx (Excel processing)
- Firebase SDK 9.6.1

---

## 📂 Project Structure

```
IT-Management-Interface/
├── index.html          # Main application (728 lines)
├── css/
│   └── style.css      # Styling (1905 lines)
├── js/
│   └── app.js         # Application logic (3399 lines)
└── .git/              # Git repository
```

---

## 🏢 Site Configuration

### WTC (Wijeya Television Corporation)
- **Technicians**: Adithya, Minosh, Niluksha, Gayan
- **Departments**: Engineering, NEWS, Scheduling, MCR, PCR 1, PCR 2, Marketing A/B, Marketing C, Research, Political, GFX, Transmission, Library, Maintenance

### HLS (Hiru Live Streaming)
- **Technicians**: Navendra, Buddhika
- **Departments**: Production, PCR, Engineering, Camera, Library, Maintenance

---

## 📖 Usage

### Login
1. Enter username and password
2. Change password if first-time login
3. Select site (WTC or HLS)

### Adding a Device
1. Navigate to "Add New Device"
2. Fill required fields: PC Number, Model, Serial, Department
3. Add network interfaces, monitors, software licenses (optional)
4. Enter hardware specs (optional)
5. Click "Save Device"

### Reporting a Failure
1. Navigate to "Report Failure"
2. Select device from dropdown
3. Enter failure reason and priority
4. Click "Report Failure"

### Managing Failed Devices
1. Navigate to "Failed Devices"
2. View all failed devices
3. Click "Mark as Fixed" to record repair
4. Device status updates to active

### Excel Import/Export
**Export:**
- Click export button for desired filter (all/active/failed)

**Import:**
1. Download template
2. Fill in device data
3. Upload Excel file
4. Monitor progress

---

## 📊 Data Structure

### Device Information
- Basic: PC Number, Model, Serial, Department, User
- Network: Multiple interfaces with IP addresses
- Monitors: Multiple monitors with models and serials
- Software: Licenses with keys and expiry dates
- Hardware: CPU, GPU, RAM, Storage
- Status: Active, Failed, or Replaced

### Activity Logs
- Action type
- Details
- User
- Timestamp (Sri Lanka timezone)

### Repair History
- Device ID
- Repair date
- Technician
- Repair notes

---

## 🔥 Firebase Collections

**Devices:**
- `devices_wtc` - WTC site devices
- `devices_hls` - HLS site devices

**Activity Logs:**
- `activityLogs_wtc` - WTC logs
- `activityLogs_hls` - HLS logs

**Repair History:**
- `repairHistory_wtc` - WTC repairs
- `repairHistory_hls` - HLS repairs

---

## 📱 Responsive Design

- **Desktop** (>992px): Full sidebar, multi-column layouts
- **Tablet** (768-992px): Horizontal sidebar, 2-column grids
- **Mobile** (<768px): Stacked layout, single column
- **Small Mobile** (<480px): Optimized for small screens

---

## 🎨 Color Scheme

```css
Primary Color: #003135 (Dark Teal)
Success: #28A745 (Green)
Warning: #FFC107 (Yellow)
Danger: #DC3545 (Red)
Info: #17A2B8 (Blue)
```

---

## 📄 License

Proprietary software for internal use.

---

## 👥 Support

Contact IT Department for support.

---

**Version**: 1.0.0  
**Last Updated**: January 2026  
**Built with ❤️ for efficient IT asset management**
