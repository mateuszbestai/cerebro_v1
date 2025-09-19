import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  TextField,
  Box,
  IconButton,
  Tooltip,
  TableSortLabel,
  Button,
} from '@mui/material';
import {
  FilterList as FilterIcon,
  Download as DownloadIcon,
  Dashboard as DashboardIcon,
} from '@mui/icons-material';
import { useDispatch } from 'react-redux';
import { addChart } from '../../store/dashboardSlice';
import { useChat } from '../../contexts/ChatContext';

interface DataTableProps {
  data: any[];
  title?: string;
}

type Order = 'asc' | 'desc';

const DataTable: React.FC<DataTableProps> = ({ data, title = 'Data Table' }) => {
  const dispatch = useDispatch();
  const { currentSessionId, sessions } = useChat();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [orderBy, setOrderBy] = useState<string>('');
  const [order, setOrder] = useState<Order>('asc');

  if (!data || data.length === 0) {
    return <div>No data available</div>;
  }

  const columns = Object.keys(data[0]);

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleSort = (column: string) => {
    const isAsc = orderBy === column && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(column);
  };

  const filteredData = data.filter((row) =>
    Object.values(row).some((value) =>
      String(value).toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const sortedData = [...filteredData].sort((a, b) => {
    if (!orderBy) return 0;
    
    const aValue = a[orderBy];
    const bValue = b[orderBy];
    
    if (order === 'asc') {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

  const displayedData = sortedData.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  const handleExport = () => {
    const csv = [
      columns.join(','),
      ...data.map((row) => columns.map((col) => row[col]).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data.csv';
    a.click();
  };

  const handleFilter = () => {
    // Filter functionality placeholder
    console.log('Filter clicked');
  };

  const handleSendToDashboard = () => {
    // Build a Plotly table figure JSON from the data
    const values = columns.map((c) => data.map((row) => row[c] ?? null));
    const figure = {
      data: [
        {
          type: 'table',
          header: { values: columns },
          cells: { values },
        },
      ],
      layout: { title },
    };

    const sessionTitle = sessions.find(s => s.id === currentSessionId)?.title;
    dispatch(
      addChart({
        id: `table_${Date.now()}`,
        title,
        data: JSON.stringify(figure),
        type: 'table',
        source: 'chat',
        timestamp: new Date().toISOString(),
        metadata: { description: 'Saved from chat results', chatSessionId: currentSessionId, chatTitle: sessionTitle },
      })
    );
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          sx={{ width: 300 }}
        />
        <Box>
          <Tooltip title="Send table to Dashboard">
            <Button
              size="small"
              startIcon={<DashboardIcon />}
              sx={{ mr: 1 }}
              onClick={handleSendToDashboard}
              variant="outlined"
            >
              Save to Dashboard
            </Button>
          </Tooltip>
          <Tooltip title="Filter">
            <IconButton onClick={handleFilter}>
              <FilterIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Export CSV">
            <IconButton onClick={handleExport}>
              <DownloadIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell key={column}>
                  <TableSortLabel
                    active={orderBy === column}
                    direction={orderBy === column ? order : 'asc'}
                    onClick={() => handleSort(column)}
                  >
                    {column}
                  </TableSortLabel>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {displayedData.map((row, index) => (
              <TableRow key={index}>
                {columns.map((column) => (
                  <TableCell key={column}>{row[column]}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        rowsPerPageOptions={[5, 10, 25, 50]}
        component="div"
        count={filteredData.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
      />
    </Box>
  );
};

export default DataTable;
