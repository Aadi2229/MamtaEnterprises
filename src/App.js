import React, { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs as getDocsOnce,
} from "firebase/firestore";
import { jsPDF } from "jspdf";
import {
  Container,
  Box,
  Typography,
  Button,
  TextField,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  AppBar,
  Toolbar,
  Autocomplete,
  Stack,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { makeStyles } from "@mui/styles";

// --- Styling ---
const useStyles = makeStyles(() => ({
  mainBg: {
    background: "linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)",
    minHeight: "100vh",
    paddingBottom: "40px"
  },
  paper: {
    padding: "32px",
    marginBottom: "32px",
    borderRadius: "18px",
    boxShadow: "0 8px 24px rgba(80,120,200,0.08)",
    background: "#fff"
  },
  tableHead: {
    background: "#1976d2"
  },
  tableHeadCell: {
    color: "#fff",
    fontWeight: "bold"
  },
  tableRow: {
    "&:nth-of-type(odd)": { background: "#f3f8ff" }
  },
  sectionTitle: {
    fontWeight: 700,
    color: "#1976d2",
    marginBottom: "12px"
  }
}));

// --- Firebase config ---
const firebaseConfig = {
  apiKey: "AIzaSyAfA4FQGQrqw0HGS--jezqhN6_m70FZdY0",
  authDomain: "my-inv-f9022.firebaseapp.com",
  projectId: "my-inv-f9022",
  storageBucket: "my-inv-f9022.appspot.com",
  messagingSenderId: "156416320721",
  appId: "1:156416320721:web:1258946f6a432f5f0611f0",
  measurementId: "G-TMSC2DKH3E"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- Hardcoded users ---
const users = [
  { id: "user1", pass: "pass1" },
  { id: "user2", pass: "pass2" },
  { id: "user3", pass: "pass3" }
];

const PAGE_SIZE = 20;

function App() {
  const classes = useStyles();

  // Authentication
  const [user, setUser] = useState(null);
  const [loginId, setLoginId] = useState("");
  const [loginPass, setLoginPass] = useState("");

  // Inventory management
  const [operation, setOperation] = useState("");
  const [items, setItems] = useState([]);
  const [brands, setBrands] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [partyName, setPartyName] = useState("");
  const [newItem, setNewItem] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [initialQty, setInitialQty] = useState("");

  // Logs and warehouse
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState([]);
  const [lastVisible, setLastVisible] = useState(null);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [hasMoreLogs, setHasMoreLogs] = useState(true);
  const [showWarehouse, setShowWarehouse] = useState(false);
  const [warehouse, setWarehouse] = useState([]);
  const [warehouseItemFilter, setWarehouseItemFilter] = useState(null);
  const [warehouseBrandFilter, setWarehouseBrandFilter] = useState(null);

  // Remove item-brand
  const [removeItem, setRemoveItem] = useState(null);
  const [removeBrand, setRemoveBrand] = useState(null);

  // For scroll container ref
  const logScrollRef = useRef();

  // Fetch items
  useEffect(() => {
    if (user) {
      return onSnapshot(collection(db, "items"), (snapshot) => {
        setItems(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      });
    }
  }, [user]);

  // Fetch brands
  useEffect(() => {
    if (selectedItem) {
      getDocs(collection(db, "brands")).then((snapshot) => {
        setBrands(
          snapshot.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((b) => b.itemId === selectedItem.id)
        );
      });
    } else {
      getDocs(collection(db, "brands")).then((snapshot) => {
        setBrands(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      });
    }
  }, [selectedItem]);

  // Infinite scroll logs: fetch first batch when logs page opens
  useEffect(() => {
    if (showLogs) {
      setLogs([]);
      setLastVisible(null);
      setHasMoreLogs(true);
      fetchLogs(true);
    }
    // eslint-disable-next-line
  }, [showLogs]);

  // Fetch warehouse data (only itemId, brandId, quantity)
  useEffect(() => {
    if (showWarehouse) {
      const unsub = onSnapshot(
        collection(db, "inventory"),
        async (snapshot) => {
          const itemDocs = await getDocs(collection(db, "items"));
          const brandDocs = await getDocs(collection(db, "brands"));
          const itemMap = {};
          itemDocs.forEach((doc) => (itemMap[doc.id] = doc.data().name));
          const brandMap = {};
          brandDocs.forEach((doc) => (brandMap[doc.id] = doc.data().name));

          const warehouseList = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              itemId: data.itemId,
              brandId: data.brandId,
              quantity: data.quantity,
              itemName: itemMap[data.itemId] || data.itemId,
              brandName: brandMap[data.brandId] || data.brandId,
            };
          });
          setWarehouse(warehouseList);
        }
      );
      return () => unsub();
    }
  }, [showWarehouse]); // <-- FIXED: db removed from dependency array

  // Remove brand options when removeItem changes
  const removeBrandsForItem = React.useMemo(() => {
    if (!removeItem) return [];
    return brands.filter((b) => b.itemId === removeItem.id);
  }, [removeItem, brands]);

  // Infinite scroll logs: fetch logs function
  const fetchLogs = async (reset = false) => {
    if (loadingLogs || (!reset && !hasMoreLogs)) return;
    setLoadingLogs(true);

    let q = query(
      collection(db, "logs"),
      orderBy("timestamp", "desc"),
      limit(PAGE_SIZE)
    );
    if (!reset && lastVisible) {
      q = query(
        collection(db, "logs"),
        orderBy("timestamp", "desc"),
        startAfter(lastVisible),
        limit(PAGE_SIZE)
      );
    }
    const snapshot = await getDocsOnce(q);
    const newLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    setLogs(prev => reset ? newLogs : [...prev, ...newLogs]);
    setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
    if (snapshot.docs.length < PAGE_SIZE) setHasMoreLogs(false);
    setLoadingLogs(false);
  };

  // Infinite scroll logs: handle scroll
  const handleLogScroll = e => {
    const bottom =
      e.target.scrollHeight - e.target.scrollTop <= e.target.clientHeight + 5;
    if (bottom && hasMoreLogs && !loadingLogs) {
      fetchLogs();
    }
  };

  // Login handler
  const handleLogin = () => {
    const found = users.find((u) => u.id === loginId && u.pass === loginPass);
    if (found) setUser(found.id);
    else alert("Invalid credentials");
  };

  // Add/Remove stock handler
  const handleSave = async () => {
    if (!operation || !selectedItem || !selectedBrand || quantity <= 0 || price <= 0 || !partyName) {
      alert("Fill all fields correctly");
      return;
    }
    const invId = selectedItem.id + "_" + selectedBrand.id;
    const inventoryRef = doc(db, "inventory", invId);
    const inventorySnap = await getDoc(inventoryRef);
    let currentQty = inventorySnap.exists() ? inventorySnap.data().quantity : 0;
    let newQty =
      operation === "add"
        ? currentQty + parseInt(quantity)
        : currentQty - parseInt(quantity);
    if (newQty < 0) {
      alert("Insufficient stock");
      return;
    }
    // Only store itemId, brandId, quantity (NO price)
    await setDoc(inventoryRef, {
      itemId: selectedItem.id,
      brandId: selectedBrand.id,
      quantity: newQty
    });

    // PDF generation (professional bill)
    const amount = parseInt(quantity) * parseFloat(price);
    const docPDF = new jsPDF();

    // Header with colored background
    docPDF.setFillColor(25, 118, 210); // Material blue
    docPDF.rect(0, 0, 210, 25, "F");
    docPDF.setTextColor(255, 255, 255);
    docPDF.setFontSize(22);
    docPDF.text("Mamta Enterprises", 105, 15, { align: "center" });
    docPDF.setFontSize(11);
    docPDF.text("Samastipur, Bihar", 105, 22, { align: "center" });
    docPDF.setTextColor(0, 0, 0);

    // GSTIN and bill title
    docPDF.setFontSize(10);
    docPDF.text("GSTIN: 12ABCDE1234F1Z5", 10, 32);
    docPDF.setFontSize(16);
    docPDF.text("Tax Invoice", 180, 32, { align: "right" });

    // Party, Date, User, Operation
    docPDF.setFontSize(11);
    docPDF.text(`Party Name: ${partyName}`, 10, 42);
    docPDF.text(`Date: ${new Date().toLocaleString()}`, 10, 48);
    docPDF.text(`User: ${user}`, 150, 42);
    docPDF.text(`Operation: ${operation.toUpperCase()}`, 150, 48);

    // Table
    let y = 58;
    docPDF.setFontSize(12);
    docPDF.setDrawColor(25, 118, 210);
    docPDF.setLineWidth(0.5);
    docPDF.rect(10, y, 190, 10);
    docPDF.text("Item", 15, y + 7);
    docPDF.text("Brand", 55, y + 7);
    docPDF.text("Qty", 95, y + 7);
    docPDF.text("Price", 125, y + 7);
    docPDF.text("Amount", 165, y + 7);
    y += 10;
    docPDF.setFontSize(11);
    docPDF.rect(10, y, 190, 10);
    docPDF.text(selectedItem.name, 15, y + 7);
    docPDF.text(selectedBrand.name, 55, y + 7);
    docPDF.text(quantity.toString(), 95, y + 7);
    docPDF.text(`Rs. ${parseFloat(price).toFixed(2)}`, 125, y + 7);
    docPDF.text(`Rs. ${amount.toFixed(2)}`, 165, y + 7);

    // Total
    y += 20;
    docPDF.setFontSize(14);
    docPDF.setTextColor(25, 118, 210);
    docPDF.text(`Total Amount: Rs. ${amount.toFixed(2)}`, 165, y, { align: "right" });
    docPDF.setTextColor(0, 0, 0);

    // Footer
    y += 15;
    docPDF.setFontSize(12);
    docPDF.text("Thank you for your business!", 105, y, { align: "center" });

    docPDF.save(`${partyName}_bill.pdf`);

    // Log the operation (store price/amount in log, NOT warehouse)
    await addDoc(collection(db, "logs"), {
      userId: user,
      operation,
      item: selectedItem.name,
      brand: selectedBrand.name,
      quantity: parseInt(quantity),
      price: parseFloat(price),
      amount,
      partyName,
      timestamp: serverTimestamp(),
    });

    alert("Stock updated, bill PDF generated, and operation logged");
    setQuantity("");
    setPrice("");
    setPartyName("");
  };

  // Add new item/brand handler
  const handleAddNew = async () => {
    if (!newItem || !newBrand || initialQty <= 0) {
      alert("Fill all fields for new item/brand");
      return;
    }
    const itemRef = doc(db, "items", newItem);
    if (!(await getDoc(itemRef)).exists()) {
      await setDoc(itemRef, { name: newItem });
    }
    const brandRef = doc(db, "brands", newBrand);
    await setDoc(brandRef, { name: newBrand, itemId: newItem });
    const inventoryRef = doc(db, "inventory", newItem + "_" + newBrand);
    await setDoc(inventoryRef, {
      itemId: newItem,
      brandId: newBrand,
      quantity: parseInt(initialQty)
    });
    alert("New item and brand added with initial quantity");
    setNewItem("");
    setNewBrand("");
    setInitialQty("");
  };

  // Remove item-brand pair handler
  const handleRemoveItemBrand = async () => {
    if (!removeItem || !removeBrand) {
      alert("Select both item and brand to remove.");
      return;
    }
    const invId = removeItem.id + "_" + removeBrand.id;
    await deleteDoc(doc(db, "inventory", invId));
    alert(`Removed ${removeItem.name} of brand ${removeBrand.name} from warehouse.`);
    setRemoveItem(null);
    setRemoveBrand(null);
  };

  // --- UI ---
  if (!user) {
    return (
      <Container maxWidth="xs" sx={{ mt: 8 }}>
        <Paper elevation={3} sx={{ p: 4 }}>
          <Typography variant="h5" align="center" gutterBottom>
            Inventory Login
          </Typography>
          <TextField
            fullWidth
            label="User ID"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            margin="normal"
          />
          <TextField
            fullWidth
            label="Password"
            type="password"
            value={loginPass}
            onChange={(e) => setLoginPass(e.target.value)}
            margin="normal"
          />
          <Button
            fullWidth
            variant="contained"
            color="primary"
            onClick={handleLogin}
            sx={{ mt: 2 }}
          >
            Login
          </Button>
        </Paper>
      </Container>
    );
  }

  return (
    <Box className={classes.mainBg}>
      <AppBar position="static" color="primary" elevation={2}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Mamta Enterprises Inventory
          </Typography>
          <Button color="inherit" onClick={() => setShowLogs((prev) => !prev)} sx={{ mr: 1 }}>
            {showLogs ? "Back" : "Logs"}
          </Button>
          <Button color="inherit" onClick={() => setShowWarehouse((prev) => !prev)} sx={{ mr: 1 }}>
            {showWarehouse ? "Back" : "Warehouse"}
          </Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="md" sx={{ pt: 4 }}>
        {showLogs ? (
          <Paper className={classes.paper}>
            <Typography variant="h6" className={classes.sectionTitle} gutterBottom>
              Operation Logs
            </Typography>
            <div
              style={{ height: "400px", overflowY: "auto" }}
              ref={logScrollRef}
              onScroll={handleLogScroll}
            >
              <TableContainer>
                <Table stickyHeader>
                  <TableHead className={classes.tableHead}>
                    <TableRow>
                      <TableCell className={classes.tableHeadCell}>#</TableCell>
                      <TableCell className={classes.tableHeadCell}>User ID</TableCell>
                      <TableCell className={classes.tableHeadCell}>Party Name</TableCell>
                      <TableCell className={classes.tableHeadCell}>Operation</TableCell>
                      <TableCell className={classes.tableHeadCell}>Item</TableCell>
                      <TableCell className={classes.tableHeadCell}>Brand</TableCell>
                      <TableCell className={classes.tableHeadCell}>Qty</TableCell>
                      <TableCell className={classes.tableHeadCell}>Price</TableCell>
                      <TableCell className={classes.tableHeadCell}>Amount</TableCell>
                      <TableCell className={classes.tableHeadCell}>Timestamp</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {logs.map((log, idx) => (
                      <TableRow key={log.id} className={classes.tableRow}>
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell>{log.userId}</TableCell>
                        <TableCell>{log.partyName}</TableCell>
                        <TableCell>{log.operation}</TableCell>
                        <TableCell>{log.item}</TableCell>
                        <TableCell>{log.brand}</TableCell>
                        <TableCell>{log.quantity}</TableCell>
                        <TableCell>Rs. {log.price?.toFixed(2)}</TableCell>
                        <TableCell>Rs. {log.amount?.toFixed(2)}</TableCell>
                        <TableCell>
                          {log.timestamp
                            ? new Date(log.timestamp.seconds * 1000).toLocaleString()
                            : ""}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {loadingLogs && (
                <Typography align="center" sx={{ py: 2 }}>
                  Loading...
                </Typography>
              )}
              {!hasMoreLogs && (
                <Typography align="center" sx={{ py: 2, color: "gray" }}>
                  No more logs
                </Typography>
              )}
            </div>
          </Paper>
        ) : showWarehouse ? (
          <Paper className={classes.paper}>
            <Typography variant="h6" className={classes.sectionTitle} gutterBottom>
              Warehouse Stock
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} mb={2}>
              <Autocomplete
                options={items}
                getOptionLabel={(option) => option.name}
                value={warehouseItemFilter}
                onChange={(_, v) => {
                  setWarehouseItemFilter(v);
                  setWarehouseBrandFilter(null);
                }}
                renderInput={(params) => (
                  <TextField {...params} label="Filter by Item" variant="outlined" />
                )}
                sx={{ minWidth: 200 }}
                clearOnEscape
              />
              <Autocomplete
                options={brands}
                getOptionLabel={(option) => option.name}
                value={warehouseBrandFilter}
                onChange={(_, v) => {
                  setWarehouseBrandFilter(v);
                  setWarehouseItemFilter(null);
                }}
                renderInput={(params) => (
                  <TextField {...params} label="Filter by Brand" variant="outlined" />
                )}
                sx={{ minWidth: 200 }}
                clearOnEscape
              />
            </Stack>
            <TableContainer>
              <Table>
                <TableHead className={classes.tableHead}>
                  <TableRow>
                    <TableCell className={classes.tableHeadCell}>#</TableCell>
                    <TableCell className={classes.tableHeadCell}>Item</TableCell>
                    <TableCell className={classes.tableHeadCell}>Brand</TableCell>
                    <TableCell className={classes.tableHeadCell}>Qty</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {warehouse
                    .filter((row) =>
                      warehouseItemFilter
                        ? row.itemId === warehouseItemFilter.id
                        : warehouseBrandFilter
                        ? row.brandId === warehouseBrandFilter.id
                        : true
                    )
                    .map((row, idx) => (
                      <TableRow key={row.id} className={classes.tableRow}>
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell>{row.itemName}</TableCell>
                        <TableCell>{row.brandName}</TableCell>
                        <TableCell>{row.quantity}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        ) : (
          <>
            <Paper className={classes.paper}>
              <Typography variant="h6" className={classes.sectionTitle} gutterBottom>
                Stock Operation
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} mb={2}>
                <TextField
                  select
                  label="Operation"
                  value={operation}
                  onChange={(e) => setOperation(e.target.value)}
                  sx={{ minWidth: 150 }}
                >
                  <MenuItem value="add">Add Stock</MenuItem>
                  <MenuItem value="remove">Remove Stock</MenuItem>
                </TextField>
                <Autocomplete
                  options={items}
                  getOptionLabel={(option) => option.name}
                  value={selectedItem}
                  onChange={(_, v) => {
                    setSelectedItem(v);
                    setSelectedBrand(null);
                  }}
                  renderInput={(params) => (
                    <TextField {...params} label="Select Item" variant="outlined" />
                  )}
                  sx={{ minWidth: 200 }}
                  clearOnEscape
                />
                <Autocomplete
                  options={brands.filter((b) =>
                    selectedItem ? b.itemId === selectedItem.id : true
                  )}
                  getOptionLabel={(option) => option.name}
                  value={selectedBrand}
                  onChange={(_, v) => setSelectedBrand(v)}
                  renderInput={(params) => (
                    <TextField {...params} label="Select Brand" variant="outlined" />
                  )}
                  sx={{ minWidth: 200 }}
                  clearOnEscape
                />
                <TextField
                  label="Quantity"
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  sx={{ minWidth: 120 }}
                  inputProps={{ min: 1 }}
                />
                <TextField
                  label="Price per unit"
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  sx={{ minWidth: 120 }}
                  inputProps={{ min: 0.01, step: 0.01 }}
                />
                <TextField
                  label="Party Name"
                  value={partyName}
                  onChange={(e) => setPartyName(e.target.value)}
                  sx={{ minWidth: 150 }}
                />
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleSave}
                  sx={{ minWidth: 120 }}
                >
                  Save
                </Button>
              </Stack>
            </Paper>

            <Paper className={classes.paper}>
              <Typography variant="h6" className={classes.sectionTitle} gutterBottom>
                Add New Item and Brand
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} mb={2}>
                <TextField
                  label="New Item"
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  sx={{ minWidth: 200 }}
                />
                <TextField
                  label="New Brand"
                  value={newBrand}
                  onChange={(e) => setNewBrand(e.target.value)}
                  sx={{ minWidth: 200 }}
                />
                <TextField
                  label="Initial Quantity"
                  type="number"
                  value={initialQty}
                  onChange={(e) => setInitialQty(e.target.value)}
                  sx={{ minWidth: 150 }}
                  inputProps={{ min: 1 }}
                />
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={handleAddNew}
                  sx={{ minWidth: 120 }}
                >
                  Add
                </Button>
              </Stack>
            </Paper>

            <Paper className={classes.paper}>
              <Typography variant="h6" className={classes.sectionTitle} gutterBottom>
                Remove Item-Brand from Warehouse
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} mb={2}>
                <Autocomplete
                  options={items}
                  getOptionLabel={(option) => option.name}
                  value={removeItem}
                  onChange={(_, v) => {
                    setRemoveItem(v);
                    setRemoveBrand(null);
                  }}
                  renderInput={(params) => (
                    <TextField {...params} label="Select Item" variant="outlined" />
                  )}
                  sx={{ minWidth: 200 }}
                  clearOnEscape
                />
                <Autocomplete
                  options={removeBrandsForItem}
                  getOptionLabel={(option) => option.name}
                  value={removeBrand}
                  onChange={(_, v) => setRemoveBrand(v)}
                  renderInput={(params) => (
                    <TextField {...params} label="Select Brand" variant="outlined" />
                  )}
                  sx={{ minWidth: 200 }}
                  clearOnEscape
                  disabled={!removeItem}
                />
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteIcon />}
                  onClick={handleRemoveItemBrand}
                  sx={{ minWidth: 120 }}
                  disabled={!removeItem || !removeBrand}
                >
                  Remove
                </Button>
              </Stack>
            </Paper>
          </>
        )}
      </Container>
    </Box>
  );
}

export default App;
