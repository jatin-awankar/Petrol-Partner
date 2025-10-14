// "use client";

// import { useState } from "react";
// import { motion } from "framer-motion";
// import { Button } from "@/components/ui/button";
// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// import { Badge } from "@/components/ui/badge";
// import { Input } from "@/components/ui/input";
// import { Label } from "@/components/ui/label";
// import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// import {
//   ArrowLeft,
//   Wallet as WalletIcon,
//   Plus,
//   ArrowUpRight,
//   ArrowDownLeft,
//   History,
//   Download,
// } from "lucide-react";
// import { useWallet } from "@/hooks/wallet/useWallet";
// import Link from "next/link";
// import { format } from "date-fns";
// import { toast } from "sonner";

// const WalletPage = () => {
//   const [amount, setAmount] = useState("");
//   const { wallet, transactions, addMoney } = useWallet();

//   const handleAddMoney = async () => {
//     const value = parseFloat(amount);
//     if (!value || value <= 0) {
//       toast.error("Please enter a valid amount");
//       return;
//     }

//     const { error } = await addMoney(value);
//     if (!error) {
//       toast.success(`₹${value} added to your wallet`);
//       setAmount("");
//     }
//   };

//   return (
//     <div className="min-h-screen bg-background">
//       {/* Header */}
//       <header className="relative px-4 pt-3 lg:pt-7">
//         <div className="flex items-center space-x-3">
//           <Link href="/dashboard">
//             <Button variant="ghost" size="icon">
//               <ArrowLeft className="w-5 h-5" />
//             </Button>
//           </Link>
//           <h1 className="text-lg font-semibold">Wallet</h1>
//         </div>
//       </header>

//       <div className="container relative lg:top-[-50px] mx-auto p-4 space-y-6 max-w-2xl">
//         {/* Balance Card */}
//         <Card className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white border-0">
//           <CardContent className="p-6">
//             <div className="flex items-center justify-between mb-4">
//               <div className="flex items-center space-x-2">
//                 <WalletIcon className="w-6 h-6" />
//                 <span className="text-sm opacity-90">Available Balance</span>
//               </div>
//               <Button
//                 variant="ghost"
//                 size="sm"
//                 className="text-white hover:bg-white/20"
//               >
//                 <Download className="w-4 h-4 mr-2" />
//                 Statement
//               </Button>
//             </div>

//             <motion.div
//               initial={{ scale: 0.9, opacity: 0 }}
//               animate={{ scale: 1, opacity: 1 }}
//               transition={{ duration: 0.3 }}
//             >
//               <h2 className="text-3xl font-bold mb-2">
//                 ₹{(wallet?.balance || 0).toFixed(2)}
//               </h2>
//               <p className="text-sm opacity-90">
//                 Last updated: {wallet ? format(new Date(wallet.updated_at), "PPP, p") : "Never"}
//               </p>
//             </motion.div>
//           </CardContent>
//         </Card>

//         {/* Quick Actions */}
//         <div className="grid grid-cols-2 gap-4">
//           <Card className="cursor-pointer hover:shadow-md hover:scale-105 transition-all duration-300 group">
//             <CardContent className="p-4 text-center">
//               <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:bg-green-200 transition-colors">
//                 <Plus className="w-6 h-6 text-green-600 group-hover:scale-110 transition-transform" />
//               </div>
//               <p className="font-medium group-hover:text-green-600 transition-colors">
//                 Add Money
//               </p>
//             </CardContent>
//           </Card>

//           <Card className="cursor-pointer hover:shadow-md hover:scale-105 transition-all duration-300 group">
//             <CardContent className="p-4 text-center">
//               <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:bg-blue-200 transition-colors">
//                 <ArrowUpRight className="w-6 h-6 text-blue-600 group-hover:scale-110 transition-transform" />
//               </div>
//               <p className="font-medium group-hover:text-blue-600 transition-colors">
//                 Send Money
//               </p>
//             </CardContent>
//           </Card>
//         </div>

//         {/* Tabs */}
//         <Tabs defaultValue="add-money" className="space-y-4">
//           <TabsList className="grid w-full grid-cols-2">
//             <TabsTrigger value="add-money">Add Money</TabsTrigger>
//             <TabsTrigger value="history">Transaction History</TabsTrigger>
//           </TabsList>

//           {/* Add Money Tab */}
//           <TabsContent value="add-money" className="space-y-4">
//             <Card className="p-4">
//               <CardHeader>
//                 <CardTitle>Add Money to Wallet</CardTitle>
//               </CardHeader>
//               <CardContent className="space-y-4">
//                 <div>
//                   <Label htmlFor="amount">Amount</Label>
//                   <Input
//                     id="amount"
//                     type="number"
//                     placeholder="Enter amount"
//                     value={amount}
//                     onChange={(e) => setAmount(e.target.value)}
//                     className="mt-1"
//                   />
//                 </div>

//                 <div className="grid grid-cols-3 gap-2">
//                   {[100, 250, 500].map((value) => (
//                     <Button
//                       key={value}
//                       variant="outline"
//                       size="sm"
//                       onClick={() => setAmount(value.toString())}
//                       className="hover:scale-105 transition-all duration-200 hover:bg-primary"
//                     >
//                       ₹{value}
//                     </Button>
//                   ))}
//                 </div>

//                 <Button className="w-full" onClick={handleAddMoney}>
//                   Add ₹{amount || "0"} to Wallet
//                 </Button>
//               </CardContent>
//             </Card>
//           </TabsContent>

//           {/* Transaction History Tab */}
//           <TabsContent value="history" className="space-y-4">
//             <Card className="p-4">
//               <CardHeader>
//                 <CardTitle className="flex items-center space-x-2">
//                   <History className="w-5 h-5" />
//                   <span>Recent Transactions</span>
//                 </CardTitle>
//               </CardHeader>
//               <CardContent className="space-y-3">
//                 {transactions.length === 0 ? (
//                   <div className="text-center text-muted-foreground py-8">
//                     <WalletIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
//                     <p>No transactions yet</p>
//                   </div>
//                 ) : (
//                   transactions.map((tx) => (
//                     <div
//                       key={tx.id}
//                       className="flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors"
//                     >
//                       <div className="flex items-center space-x-3">
//                         <div
//                           className={`w-10 h-10 rounded-full flex items-center justify-center ${
//                             tx.transaction_type === "credit" ? "bg-green-100" : "bg-red-100"
//                           }`}
//                         >
//                           {tx.transaction_type === "credit" ? (
//                             <ArrowDownLeft className="w-5 h-5 text-green-600" />
//                           ) : (
//                             <ArrowUpRight className="w-5 h-5 text-red-600" />
//                           )}
//                         </div>

//                         <div>
//                           <p className="font-medium text-sm">{tx.description}</p>
//                           <p className="text-xs text-muted-foreground">
//                             {format(new Date(tx.created_at), "PPP, p")}
//                           </p>
//                         </div>
//                       </div>

//                       <div className="text-right">
//                         <p
//                           className={`font-semibold ${
//                             tx.transaction_type === "credit" ? "text-green-600" : "text-red-600"
//                           }`}
//                         >
//                           {tx.transaction_type === "credit" ? "+" : "-"}₹
//                           {Math.abs(tx.amount).toFixed(2)}
//                         </p>
//                         <Badge
//                           variant={tx.status === "completed" ? "secondary" : "destructive"}
//                           className="text-xs"
//                         >
//                           {tx.status}
//                         </Badge>
//                       </div>
//                     </div>
//                   ))
//                 )}
//               </CardContent>
//             </Card>
//           </TabsContent>
//         </Tabs>
//       </div>
//     </div>
//   );
// };

// export default WalletPage;
