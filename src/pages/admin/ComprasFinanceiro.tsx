import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  ShoppingCart, 
  Filter, 
  Search, 
  Trash2,
  MessageSquare,
  Eye,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle
} from "lucide-react";
import { toast } from "sonner";
import { 
  getAllRequests,
  getRequestById,
  deleteRequest,
  RequestStatus,
  RequestData
} from "@/services/reservationService";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import ChatAdmin from "@/components/admin/ChatAdmin";
import { createNotification } from "@/services/notificationService";
import { updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const getStatusBadge = (status: RequestStatus) => {
  switch (status) {
    case "pending": return <Badge variant="outline" className="border-yellow-500 text-yellow-600">Pendente</Badge>;
    case "approved": return <Badge className="bg-green-500 text-white">Aprovada</Badge>;
    case "rejected": return <Badge variant="destructive">Reprovada</Badge>;
    case "in-progress": return <Badge className="bg-blue-500 text-white">Em Andamento</Badge>;
    case "completed": return <Badge className="bg-slate-500 text-white">Concluída</Badge>;
    case "canceled": return <Badge className="bg-amber-500 text-white">Cancelada</Badge>;
    default: return <Badge variant="outline">Desconhecido</Badge>;
  }
};

const ComprasFinanceiro = () => {
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<RequestData | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<RequestStatus>("pending");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [requestToDelete, setRequestToDelete] = useState<{id: string, collectionName: string} | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatRequest, setChatRequest] = useState<RequestData | null>(null);
  const [unreadMessages, setUnreadMessages] = useState<Record<string, number>>({});
  const [viewedRequests, setViewedRequests] = useState<Set<string>>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('financeViewedRequests') : null;
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  
  const purchaseTypes = ["Compra Pedagógica", "Compra Administrativa", "Compra Infraestrutura"];
  const [selectedTypes, setSelectedTypes] = useState<string[]>(purchaseTypes);

  const { data: allRequests = [], isLoading } = useQuery({
    queryKey: ['allRequests'],
    queryFn: () => getAllRequests(),
  });

  useEffect(() => {
    const checkUnreadMessages = () => {
      const newUnread: Record<string, number> = {};
      
      allRequests.forEach(req => {
        const messages = req.messages || [];
        const unreadCount = messages.filter(msg => 
          !msg.isAdmin && !viewedRequests.has(`${req.id}-${msg.timestamp.toMillis()}`)
        ).length;
        if (unreadCount > 0) {
          newUnread[req.id] = unreadCount;
        }
      });
      
      setUnreadMessages(newUnread);
    };

    checkUnreadMessages();
  }, [allRequests, viewedRequests]);

  const handleOpenChat = async (request: RequestData) => {
    try {
      const fullRequest = await getRequestById(request.id, request.collectionName);
      setChatRequest(fullRequest);
      
      setViewedRequests(prev => {
        const newSet = new Set(prev);
        (fullRequest.messages || []).forEach(msg => {
          if (!msg.isAdmin) {
            newSet.add(`${fullRequest.id}-${msg.timestamp.toMillis()}`);
          }
        });
        localStorage.setItem('financeViewedRequests', JSON.stringify(Array.from(newSet)));
        return newSet;
      });
      
      setUnreadMessages(prev => {
        const newUnread = {...prev};
        delete newUnread[fullRequest.id];
        return newUnread;
      });
      
      setIsChatOpen(true);
    } catch (error) {
      toast.error("Erro ao abrir chat");
      console.error("Error:", error);
    }
  };

  const handleStatusChange = async () => {
    if (!selectedRequest || !newStatus) return;
    
    try {
      const docRef = doc(db, selectedRequest.collectionName, selectedRequest.id);
      await updateDoc(docRef, { status: newStatus });
  
      await createNotification({
        title: 'Alteração de Status',
        message: `Status da sua solicitação de compra foi alterado para: ${newStatus}`,
        link: 'minhas-solicitacoes',
        createdAt: new Date(),
        readBy: [],
        recipients: [selectedRequest.userEmail],
        isBatch: false
      });
  
      toast.success("Status atualizado");
      queryClient.invalidateQueries({ queryKey: ['allRequests'] });
      setSelectedRequest({ ...selectedRequest, status: newStatus });
    } catch (error) {
      toast.error("Erro ao atualizar");
      console.error("Error:", error);
    }
  };

  const handleDeleteRequest = (request: RequestData) => {
    setRequestToDelete({
      id: request.id,
      collectionName: request.collectionName
    });
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!requestToDelete) return;

    try {
      await deleteRequest(requestToDelete.id, requestToDelete.collectionName);
      toast.success("Excluído com sucesso");
      setIsDeleteDialogOpen(false);
      setRequestToDelete(null);
      if (isDetailsOpen) setIsDetailsOpen(false);
      queryClient.invalidateQueries({ queryKey: ['allRequests'] });
    } catch (error) {
      toast.error("Erro ao excluir");
      console.error("Error:", error);
    }
  };

  const filteredRequests = allRequests
    .filter(req => req.type === 'purchase')
    .filter(req => {
      const search = searchTerm.toLowerCase();
      return (
        (req.userName?.toLowerCase().includes(search) ||
        req.userEmail?.toLowerCase().includes(search) ||
        req.itemName?.toLowerCase().includes(search)) &&
        selectedTypes.includes(req.tipo)
    )});

  // Calcular estatísticas
  const totalRequests = filteredRequests.length;
  const pendingRequests = filteredRequests.filter(req => req.status === 'pending').length;
  const approvedRequests = filteredRequests.filter(req => req.status === 'approved').length;
  const totalValue = filteredRequests.reduce((sum, req) => sum + ((req.quantity || 0) * (req.unitPrice || 0)), 0);

  return (
    <AppLayout>
      <div className="min-h-screen bg-white relative overflow-hidden">
        {/* Background decorativo */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-sidebar blur-3xl opacity-5"></div>
          <div className="absolute right-1/4 bottom-1/4 h-80 w-80 rounded-full bg-eccos-purple blur-3xl opacity-5"></div>
        </div>

        <div className="relative z-10 space-y-8 p-6 md:p-12">
          {/* Header */}
          <h1 className="text-3xl font-bold flex items-center gap-2 bg-gradient-to-r from-sidebar to-eccos-purple bg-clip-text text-transparent">
            <ShoppingCart className="text-eccos-purple" size={35} />
            Solicitações de Compra
          </h1>

          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-eccos-purple"></div>
            </div>
          ) : (
            <>
              {/* Cards de estatísticas */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
                <Card className="bg-white border border-gray-100 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Total de Solicitações</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold bg-gradient-to-r from-sidebar to-eccos-purple bg-clip-text text-transparent">
                      {totalRequests}
                    </div>
                    <Badge variant="outline" className="mt-2 border-eccos-purple text-eccos-purple">
                      Total
                    </Badge>
                  </CardContent>
                </Card>

                <Card className="bg-white border border-gray-100 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Pendentes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold bg-gradient-to-r from-yellow-500 to-yellow-600 bg-clip-text text-transparent">
                      {pendingRequests}
                    </div>
                    <Badge variant="outline" className="mt-2 border-yellow-500 text-yellow-500">
                      <Clock className="h-3 w-3 mr-1" />
                      Aguardando
                    </Badge>
                  </CardContent>
                </Card>

                <Card className="bg-white border border-gray-100 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Aprovadas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold bg-gradient-to-r from-green-500 to-green-600 bg-clip-text text-transparent">
                      {approvedRequests}
                    </div>
                    <Badge variant="outline" className="mt-2 border-green-500 text-green-500">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Aprovadas
                    </Badge>
                  </CardContent>
                </Card>

                <Card className="bg-white border border-gray-100 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Valor Total</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold bg-gradient-to-r from-sidebar to-eccos-purple bg-clip-text text-transparent">
                      {new Intl.NumberFormat('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                        notation: 'compact'
                      }).format(totalValue)}
                    </div>
                    <Badge variant="outline" className="mt-2 border-eccos-purple text-eccos-purple">
                      <DollarSign className="h-3 w-3 mr-1" />
                      Total
                    </Badge>
                  </CardContent>
                </Card>
              </div>

              {/* Filtros */}
              <Card className="bg-white border border-gray-100 rounded-2xl shadow-lg">
                <CardContent className="p-6">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="relative flex-1 max-w-md">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Pesquisar por nome, email ou item..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 h-12 rounded-xl border-gray-200 focus:border-eccos-purple"
                      />
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="flex items-center gap-2 h-12 rounded-xl border-gray-200 px-6">
                          <Filter className="h-4 w-4" /> Tipo ({selectedTypes.length})
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-background rounded-xl">
                        {purchaseTypes.map((type) => (
                          <DropdownMenuCheckboxItem
                            key={type}
                            checked={selectedTypes.includes(type)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedTypes([...selectedTypes, type]);
                              } else {
                                setSelectedTypes(selectedTypes.filter(t => t !== type));
                              }
                            }}
                          >
                            {type}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>

              {/* Tabela */}
              {filteredRequests.length === 0 ? (
                <Card className="bg-white border border-gray-100 rounded-2xl shadow-lg">
                  <CardContent className="p-12">
                    <div className="text-center text-muted-foreground">
                      <ShoppingCart className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                      <p className="text-lg">Nenhuma solicitação de compra encontrada</p>
                      <p className="text-sm">Tente ajustar os filtros para ver mais resultados</p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="bg-white border border-gray-100 rounded-2xl shadow-lg overflow-hidden">
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-gray-100">
                            <TableHead className="font-semibold text-gray-700">Solicitante</TableHead>
                            <TableHead className="font-semibold text-gray-700">Item</TableHead>
                            <TableHead className="font-semibold text-gray-700">Status</TableHead>
                            <TableHead className="font-semibold text-gray-700">Valor Total</TableHead>
                            <TableHead className="font-semibold text-gray-700">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredRequests.map((request) => (
                            <TableRow key={request.id} className="border-gray-100 hover:bg-gray-50/50 transition-colors">
                              <TableCell className="font-medium">{request.userName}</TableCell>
                              <TableCell>{request.itemName}</TableCell>
                              <TableCell>{getStatusBadge(request.status)}</TableCell>
                              <TableCell className="font-semibold">
                                {new Intl.NumberFormat('pt-BR', {
                                  style: 'currency',
                                  currency: 'BRL'
                                }).format((request.quantity || 0) * (request.unitPrice || 0))}
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-2">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 rounded-xl hover:bg-eccos-purple/10 hover:text-eccos-purple"
                                    onClick={() => {
                                      setSelectedRequest(request);
                                      setIsDetailsOpen(true);
                                    }}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 rounded-xl hover:bg-blue-50 hover:text-blue-600 relative"
                                    onClick={() => handleOpenChat(request)}
                                  >
                                    <MessageSquare className="h-4 w-4" />
                                    {unreadMessages[request.id] > 0 && (
                                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                                        {unreadMessages[request.id]}
                                      </span>
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 rounded-xl hover:bg-red-50 hover:text-red-600"
                                    onClick={() => handleDeleteRequest(request)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* Dialog de detalhes */}
          <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
            <DialogContent className="max-w-2xl rounded-2xl">
              {selectedRequest && (
                <>
                  <DialogHeader>
                    <DialogTitle className="text-xl font-bold">Detalhes da Compra</DialogTitle>
                    <DialogDescription>
                      {format(
                        new Date(selectedRequest.createdAt.toMillis()),
                        "dd 'de' MMMM 'de' yyyy 'às' HH:mm",
                        { locale: ptBR }
                      )}
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-gray-600">Tipo</p>
                        <p className="font-medium">{selectedRequest.tipo || "Não especificado"}</p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-gray-600">Solicitante</p>
                        <p className="font-medium">{selectedRequest.userName}</p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-gray-600">Status</p>
                        <div className="flex items-center gap-2">
                          <Select 
                            value={selectedRequest.status} 
                            onValueChange={(value) => setNewStatus(value as RequestStatus)}
                          >
                            <SelectTrigger className="w-[180px] rounded-xl">
                              <SelectValue placeholder="Selecionar status" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              <SelectItem value="pending">Pendente</SelectItem>
                              <SelectItem value="approved">Aprovada</SelectItem>
                              <SelectItem value="rejected">Reprovada</SelectItem>
                              <SelectItem value="in-progress">Em Andamento</SelectItem>
                              <SelectItem value="completed">Concluída</SelectItem>
                              <SelectItem value="canceled">Cancelada</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button 
                            onClick={handleStatusChange}
                            className="rounded-xl bg-gradient-to-r from-sidebar to-eccos-purple hover:from-eccos-purple hover:to-sidebar"
                          >
                            Atualizar
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-gray-600">Item</p>
                        <p className="font-medium">{selectedRequest.itemName}</p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-gray-600">Quantidade</p>
                        <p className="font-medium">{selectedRequest.quantity}</p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-gray-600">Valor Unitário</p>
                        <p className="font-medium">
                          {new Intl.NumberFormat('pt-BR', {
                            style: 'currency',
                            currency: 'BRL'
                          }).format(selectedRequest.unitPrice || 0)}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-gray-600">Valor Total</p>
                        <p className="font-bold text-lg bg-gradient-to-r from-sidebar to-eccos-purple bg-clip-text text-transparent">
                          {new Intl.NumberFormat('pt-BR', {
                            style: 'currency',
                            currency: 'BRL'
                          }).format((selectedRequest.quantity || 0) * (selectedRequest.unitPrice || 0))}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-600">Justificativa</p>
                      <div className="bg-gray-50 p-4 rounded-xl">
                        <p className="whitespace-pre-wrap">{selectedRequest.justification}</p>
                      </div>
                    </div>
                  </div>
                  
                  <DialogFooter>
                    <Button 
                      variant="outline"
                      onClick={() => handleDeleteRequest(selectedRequest)}
                      className="rounded-xl border-red-200 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Excluir
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>

          {/* Chat Admin */}
          <ChatAdmin 
            request={chatRequest} 
            isOpen={isChatOpen} 
            onOpenChange={setIsChatOpen}
            onMessageSent={() => queryClient.invalidateQueries({ queryKey: ['allRequests'] })}
          />

          {/* Dialog de confirmação de exclusão */}
          <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <AlertDialogContent className="rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                <AlertDialogDescription>
                  Tem certeza que deseja excluir permanentemente esta solicitação? Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleDeleteConfirm} 
                  className="rounded-xl bg-red-600 hover:bg-red-700"
                >
                  Confirmar Exclusão
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Footer */}
        <footer className="relative z-10 bg-gray-50 py-10 px-4 md:px-12">
          <div className="max-w-6xl mx-auto text-center">
            <p className="text-gray-500 text-sm">
              © 2025 Colégio ECCOS - Todos os direitos reservados
            </p>
          </div>
        </footer>
      </div>
    </AppLayout>
  );
};

export default ComprasFinanceiro;