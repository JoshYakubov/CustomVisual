/*
 *  Power BI Visual CLI
 *
 *  Custom Visual: Running Total Stacked Bar Chart
 *
 *  This visual displays a stacked bar chart with running totals per category over a series of quarters.
 */

"use strict";

import powerbi from "powerbi-visuals-api";
import "./../style/visual.less";
import * as d3 from "d3";

import DataView = powerbi.DataView;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;

interface DataPoint {
    quarter: string;
    category: string;
    value: number;
}

interface ProcessedDataPoint extends DataPoint {
    runningTotal: number;
}

interface StackedDataPoint {
    quarter: string;
    [key: string]: number | string;
}

export class Visual implements IVisual {
    private target: HTMLElement;
    private host: IVisualHost;

    constructor(options?: VisualConstructorOptions) {
        this.target = options?.element || document.createElement('div');
        this.host = options?.host || {} as powerbi.extensibility.visual.IVisualHost;
    }

    public update(options: VisualUpdateOptions) {

        while (this.target.firstChild) {
            this.target.removeChild(this.target.firstChild);
        }

        const dataView: DataView = options.dataViews[0];
        if (!dataView || !dataView.categorical) {
            return;
        }

        const categorical = dataView.categorical;
        const categories = categorical.categories;
        const values = categorical.values;

        if (!categories || categories.length === 0 || !values || values.length === 0) {
            return;
        }

        const category = categories[0];

        let quarters = category.values.map(value => value as string);
        quarters = this.sortQuarters(quarters);

        const seriesCategories = values.grouped().map(group => group.name as string);

        const data: DataPoint[] = this.buildDataArray(quarters, seriesCategories, values);

        const processedData: ProcessedDataPoint[] = this.computeRunningTotals(data);

        const stackedData: StackedDataPoint[] = this.transformToStackedData(processedData, quarters, seriesCategories);

        const width = options.viewport.width;
        const height = options.viewport.height;

        const xScale = d3.scaleBand<string>()
            .domain(quarters)
            .range([0, width])
            .padding(0.1);

        const maxY = d3.max(stackedData, (d: StackedDataPoint) => {
            let total = 0;
            seriesCategories.forEach(category => {
                total += d[category] as number || 0;
            });
            return total;
        }) || 0;

        const yScale = d3.scaleLinear()
            .domain([0, maxY])
            .range([height, 0]);

        const stackGenerator = d3.stack<StackedDataPoint>()
            .keys(seriesCategories);

        const stackedSeries = stackGenerator(stackedData);

        const svg = d3.select(this.target)
            .append("svg")
            .attr("width", width)
            .attr("height", height);

        // Render the stacked bars
        svg.selectAll(".series")
            .data(stackedSeries)
            .enter()
            .append("g")
            .attr("class", "series")
            .attr("fill", (d, i) => d3.schemeCategory10[i % 10])
            .selectAll("rect")
            .data(d => d)
            .enter()
            .append("rect")
            .attr("x", (d: any) => xScale(d.data.quarter) ?? 0)
            .attr("y", (d: any) => yScale(d[1]))
            .attr("height", (d: any) => yScale(d[0]) - yScale(d[1]))
            .attr("width", xScale.bandwidth());

        svg.selectAll(".series")
            .data(stackedSeries)
            .selectAll("text")
            .data(d => d)
            .enter()
            .append("text")
            .attr("x", (d: any) => (xScale(d.data.quarter) ?? 0) + xScale.bandwidth() / 2)
            .attr("y", (d: any) => yScale(d[1]) + (yScale(d[0]) - yScale(d[1])) / 2)
            .attr("dy", "0.35em")
            .attr("text-anchor", "middle")
            .text((d: any) => d[1] - d[0])
            .attr("fill", "white"); 
    }

    private sortQuarters(quarters: string[]): string[] {
        return quarters.sort((a, b) => a.localeCompare(b));
    }

    private buildDataArray(quarters: string[], seriesCategories: string[], values: powerbi.DataViewValueColumns): DataPoint[] {
        const data: DataPoint[] = [];

        for (let j = 0; j < seriesCategories.length; j++) {
            const category = seriesCategories[j];
            const valueColumn = values.grouped()[j].values[0]; // Assuming single measure

            for (let i = 0; i < quarters.length; i++) {
                const quarter = quarters[i];
                const value = (valueColumn.values[i] as number) || 0;

                data.push({
                    quarter: quarter,
                    category: category,
                    value: value
                });
            }
        }

        return data;
    }

    private computeRunningTotals(data: DataPoint[]): ProcessedDataPoint[] {
        const runningTotals: { [key: string]: number } = {};
        const processedData: ProcessedDataPoint[] = [];

        data.forEach(d => {
            const key = d.category;

            if (!runningTotals[key]) {
                runningTotals[key] = 0;
            }
            runningTotals[key] += d.value;

            processedData.push({
                quarter: d.quarter,
                category: d.category,
                value: d.value,
                runningTotal: runningTotals[key]
            });
        });

        return processedData;
    }

    private transformToStackedData(
        processedData: ProcessedDataPoint[],
        quarters: string[],
        seriesCategories: string[]
    ): StackedDataPoint[] {
        const stackedData: StackedDataPoint[] = [];

        quarters.forEach(quarter => {
            const dataPoint: StackedDataPoint = { quarter: quarter };
            seriesCategories.forEach(category => {
                const filteredData = processedData.find(d => d.quarter === quarter && d.category === category);
                dataPoint[category] = filteredData ? filteredData.runningTotal : 0;
            });
            stackedData.push(dataPoint);
        });

        return stackedData;
    }
}
