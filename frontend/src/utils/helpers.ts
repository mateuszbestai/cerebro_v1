export const formatDate = (date: string | Date, format?: string): string => {
    const d = new Date(date);
    
    if (!format) {
      return d.toLocaleDateString();
    }
    
    // Simple date formatting - in production use date-fns or moment.js
    const options: Intl.DateTimeFormatOptions = {};
    
    if (format.includes('time')) {
      options.hour = '2-digit';
      options.minute = '2-digit';
    }
    
    return d.toLocaleString(undefined, options);
  };
  
  export const formatNumber = (num: number, decimals: number = 2): string => {
    return num.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };
  
  export const formatBytes = (bytes: number, decimals: number = 2): string => {
    if (bytes === 0) return '0 Bytes';
  
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
    const i = Math.floor(Math.log(bytes) / Math.log(k));
  
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };
  
  export const truncateText = (text: string, maxLength: number = 100): string => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };
  
  export const debounce = <T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): ((...args: Parameters<T>) => void) => {
    let timeout: NodeJS.Timeout | null = null;
    
    return (...args: Parameters<T>) => {
      if (timeout) clearTimeout(timeout);
      
      timeout = setTimeout(() => {
        func(...args);
      }, wait);
    };
  };
  
  export const downloadFile = (data: any, filename: string, type: string = 'application/json'): void => {
    const blob = new Blob([data], { type });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };
  
  export const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      return false;
    }
  };
  
  export const generateId = (): string => {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };
  
  export const parseJSON = <T>(json: string, fallback: T): T => {
    try {
      return JSON.parse(json);
    } catch (error) {
      console.error('Failed to parse JSON:', error);
      return fallback;
    }
  };