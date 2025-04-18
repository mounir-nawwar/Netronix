import React, { useState, useEffect } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend
} from 'recharts';
import { 
  FiHome, FiTrendingUp, FiDollarSign, FiShoppingBag, FiUsers, 
  FiPackage, FiAlertCircle, FiShoppingCart, FiCalendar, FiClock,
  FiArrowUp, FiArrowDown, FiCheck, FiPieChart
} from 'react-icons/fi';
import axios from 'axios';
import { backendUrl, currency } from '../App';
import { toast } from 'react-toastify';

const Dashboard = ({ token }) => {
  // Dashboard Stats
  const [stats, setStats] = useState({
    totalSales: 0,
    totalOrders: 0,
    totalProducts: 0,
    totalCustomers: 0,
    lowStockItems: 0
  });

  // Chart Data
  const [salesData, setSalesData] = useState([]);
  const [categoryData, setCategoryData] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [trendingProducts, setTrendingProducts] = useState([]);
  const [orderStatus, setOrderStatus] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  // Time Range
  const [timeRange, setTimeRange] = useState('7d');

  const COLORS = ['#6a5acd', '#8470ff', '#9370db', '#483d8b', '#7b68ee'];

  useEffect(() => {
    fetchDashboardData();
  }, [timeRange, token]);

  const fetchDashboardData = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      // Fetch products data
      const productsResponse = await axios.get(backendUrl + '/api/product/list');
      let products = [];
      if (productsResponse.data.success) {
        products = productsResponse.data.products;
      }

      // Fetch orders data
      const ordersResponse = await axios.post(backendUrl + '/api/order/list', {}, { headers: { token } });
      let orders = [];
      if (ordersResponse.data.success) {
        orders = ordersResponse.data.orders;
      }

      // Calculate dashboard data from real data
      calculateDashboardData(products, orders);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      toast.error("Failed to load dashboard data");
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate dashboard data from real data
  const calculateDashboardData = (products, orders) => {
    // Filter orders based on time range
    const daysAgo = timeRange === '7d' ? 7 : 30;
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - daysAgo);
    
    const recentOrders = orders.filter(order => new Date(order.date) >= dateThreshold);
    
    // Calculate total sales
    const totalSales = orders.reduce((sum, order) => sum + order.amount, 0);
    
    // Get unique customers
    const uniqueCustomers = [...new Set(orders.map(order => order.address.email || order.address.phone))];
    
    // Count low stock items
    const lowStockThreshold = 10;
    let lowStockCount = 0;
    
    // Process inventory data from products
    products.forEach(product => {
      if (product.inventory) {
        const inventoryValues = Object.values(product.inventory);
        if (inventoryValues.some(stock => stock <= lowStockThreshold)) {
          lowStockCount++;
        }
      }
    });
    
    // Set the stats
    setStats({
      totalSales,
      totalOrders: orders.length,
      totalProducts: products.length,
      totalCustomers: uniqueCustomers.length,
      lowStockItems: lowStockCount
    });

    // Calculate sales data over time
    const salesByDay = {};
    const today = new Date();
    
    // Initialize the days
    for (let i = daysAgo - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateString = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      salesByDay[dateString] = { sales: 0, orders: 0 };
    }
    
    // Fill in the actual data
    recentOrders.forEach(order => {
      const date = new Date(order.date);
      const dateString = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      if (salesByDay[dateString]) {
        salesByDay[dateString].sales += order.amount;
        salesByDay[dateString].orders += 1;
      }
    });
    
    // Convert to array format for charts
    const salesDataArray = Object.keys(salesByDay).map(date => ({
      date,
      sales: salesByDay[date].sales,
      orders: salesByDay[date].orders
    }));
    
    setSalesData(salesDataArray);

    // Calculate category data
    const categoryCounts = {};
    products.forEach(product => {
      if (product.tags && Array.isArray(product.tags)) {
        product.tags.forEach(tag => {
          if (!categoryCounts[tag]) {
            categoryCounts[tag] = 0;
          }
          categoryCounts[tag]++;
        });
      }
    });
    
    // Convert to array and take top 5 categories
    const categoryDataArray = Object.keys(categoryCounts)
      .map(name => ({ name, value: categoryCounts[name] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    
    setCategoryData(categoryDataArray);

    // Set recent orders
    const latestOrders = [...orders]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5)
      .map(order => ({
        id: order._id,
        customer: `${order.address.firstName} ${order.address.lastName}`,
        date: new Date(order.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        amount: order.amount,
        status: order.status
      }));
    
    setRecentOrders(latestOrders);

    // Set low stock products
    const lowStockItems = [];
    products.forEach(product => {
      if (product.inventory) {
        const inventoryValues = Object.values(product.inventory);
        const minStock = Math.min(...inventoryValues);
        
        if (minStock <= lowStockThreshold) {
          lowStockItems.push({
            id: product._id,
            name: product.name,
            image: product.image[0],
            stock: minStock
          });
        }
      }
    });
    
    setLowStockProducts(lowStockItems.slice(0, 5));

    // Calculate order status distribution
    const statusCount = {};
    orders.forEach(order => {
      const status = order.status || 'N/A';
      if (!statusCount[status]) {
        statusCount[status] = 0;
      }
      statusCount[status]++;
    });
    
    setOrderStatus(statusCount);

    // Calculate trending products based on most ordered items
    const productOrderCounts = {};
    orders.forEach(order => {
      order.items.forEach(item => {
        if (!productOrderCounts[item.name]) {
          productOrderCounts[item.name] = {
            count: 0,
            image: '',
            id: ''
          };
        }
        productOrderCounts[item.name].count += item.quantity;
      });
    });
    
    // Find images for the trending products
    products.forEach(product => {
      if (productOrderCounts[product.name]) {
        productOrderCounts[product.name].image = product.image[0];
        productOrderCounts[product.name].id = product._id;
      }
    });
    
    // Convert to array and take top 5
    const trendingProductsArray = Object.keys(productOrderCounts)
      .map(name => ({
        id: productOrderCounts[name].id,
        name,
        image: productOrderCounts[name].image,
        sales: productOrderCounts[name].count
      }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5);
    
    setTrendingProducts(trendingProductsArray);
  };

  // Stat Card Component
  const StatCard = ({ icon, title, value, trend, trendValue, bg = 'bg-white' }) => (
    <div className={`${bg} rounded-xl shadow-sm p-5 flex flex-col`}>
      <div className="flex justify-between items-start mb-2">
        <div className="p-2 rounded-lg bg-[#f5f3ff]">
          {icon}
        </div>
        {trend && (
          <div className={`flex items-center text-xs ${trendValue >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {trendValue >= 0 ? <FiArrowUp className="mr-1" /> : <FiArrowDown className="mr-1" />}
            {Math.abs(trendValue)}%
          </div>
        )}
      </div>
      <p className="text-sm text-gray-600 mt-2">{title}</p>
      <p className="text-xl font-michroma font-bold mt-1">{value}</p>
    </div>
  );

  return (
    <div className="font-michroma">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setTimeRange('7d')}
            className={`px-3 py-1.5 rounded-md text-sm ${timeRange === '7d' ? 'bg-[#6a5acd] text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            Last 7 Days
          </button>
          <button 
            onClick={() => setTimeRange('30d')}
            className={`px-3 py-1.5 rounded-md text-sm ${timeRange === '30d' ? 'bg-[#6a5acd] text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            Last 30 Days
          </button>
          <button 
            onClick={() => fetchDashboardData()}
            className="ml-2 p-2 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            <FiClock className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#6a5acd]"></div>
        </div>
      ) : (
        <>
          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <StatCard 
              icon={<FiDollarSign className="w-5 h-5 text-[#6a5acd]" />}
              title="Total Sales"
              value={`${currency}${stats.totalSales.toLocaleString()}`}
              trend={true}
              trendValue={12}
            />
            <StatCard 
              icon={<FiShoppingBag className="w-5 h-5 text-[#6a5acd]" />}
              title="Total Orders"
              value={stats.totalOrders.toLocaleString()}
              trend={true}
              trendValue={8}
            />
            <StatCard 
              icon={<FiUsers className="w-5 h-5 text-[#6a5acd]" />}
              title="Customers"
              value={stats.totalCustomers.toLocaleString()}
              trend={true}
              trendValue={5}
            />
            <StatCard 
              icon={<FiPackage className="w-5 h-5 text-[#6a5acd]" />}
              title="Products"
              value={stats.totalProducts.toLocaleString()}
              trend={false}
            />
            <StatCard 
              icon={<FiAlertCircle className="w-5 h-5 text-[#6a5acd]" />}
              title="Low Stock Items"
              value={stats.lowStockItems.toLocaleString()}
              trend={true}
              trendValue={-3}
              bg="bg-[#fffbeb]"
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Sales Chart */}
            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-medium">Sales Overview</h2>
                <div className="text-xs text-gray-500">
                  <span className="inline-block w-3 h-3 bg-[#6a5acd] rounded-full mr-1"></span> Sales
                </div>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart
                  data={salesData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6a5acd" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#6a5acd" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <Tooltip contentStyle={{ borderRadius: '8px' }} />
                  <Area type="monotone" dataKey="sales" stroke="#6a5acd" fillOpacity={1} fill="url(#colorSales)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Category Distribution */}
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h2 className="font-medium mb-4">Sales by Category</h2>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    fill="#8884d8"
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Lower Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Recent Orders */}
            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-medium">Recent Orders</h2>
                <button className="text-xs text-[#6a5acd]">View All</button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="text-left text-xs text-gray-500">
                      <th className="pb-3 font-medium">Order ID</th>
                      <th className="pb-3 font-medium">Customer</th>
                      <th className="pb-3 font-medium">Date</th>
                      <th className="pb-3 font-medium">Amount</th>
                      <th className="pb-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((order, index) => (
                      <tr key={index} className="text-sm border-t">
                        <td className="py-3 text-[#6a5acd]">{order.id}</td>
                        <td className="py-3">{order.customer}</td>
                        <td className="py-3">{order.date}</td>
                        <td className="py-3">{currency}{order.amount}</td>
                        <td className="py-3">
                          <span className={`px-2 py-1 rounded-full text-xs 
                            ${order.status === 'Delivered' && 'bg-green-100 text-green-800'}
                            ${order.status === 'Shipped' && 'bg-blue-100 text-blue-800'}
                            ${order.status === 'Processing' && 'bg-yellow-100 text-yellow-800'}
                            ${order.status === 'Cancelled' && 'bg-red-100 text-red-800'}
                          `}>
                            {order.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Low Stock Items */}
            <div className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-medium">Low Stock Items</h2>
                <button className="text-xs text-[#6a5acd]">View All</button>
              </div>
              <div className="space-y-4">
                {lowStockProducts.map((product, index) => (
                  <div key={index} className="flex items-center space-x-3">
                    <img 
                      src={product.image} 
                      alt={product.name} 
                      className="w-10 h-10 object-cover rounded-md"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{product.name}</p>
                      <p className="text-xs text-gray-500">{product.stock} items left</p>
                    </div>
                    <div className={`px-2 py-1 rounded-md text-xs ${product.stock <= 5 ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                      {product.stock <= 5 ? 'Critical' : 'Low'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard; 