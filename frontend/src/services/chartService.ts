import { ChartData } from '../types';

export class ChartService {
  static processChartData(rawData: any): ChartData {
    // Process and validate chart data
    if (typeof rawData === 'string') {
      try {
        return {
          type: 'auto',
          data: rawData,
          config: {
            responsive: true,
            displayModeBar: true,
          },
        };
      } catch (error) {
        console.error('Error processing chart data:', error);
        throw error;
      }
    }
    
    return rawData as ChartData;
  }

  static exportChart(chartData: ChartData, format: 'png' | 'svg' | 'pdf' = 'png'): void {
    // Implementation would use Plotly's export functionality
    console.log(`Exporting chart as ${format}`);
  }

  static generateChartConfig(type: string, options?: any): any {
    const baseConfig = {
      responsive: true,
      displayModeBar: true,
      displaylogo: false,
      toImageButtonOptions: {
        format: 'png',
        filename: `chart_${type}_${Date.now()}`,
        height: 500,
        width: 700,
        scale: 1,
      },
    };

    return { ...baseConfig, ...options };
  }
}