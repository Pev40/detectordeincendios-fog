import pandas as pd
import matplotlib.pyplot as plt
import os

def analyze_latency():
    csv_path = 'results_latency.csv'
    if not os.path.exists(csv_path):
        print(f"File {csv_path} not found. Run experiment_latency.js first.")
        return

    df = pd.read_csv(csv_path)
    
    # Check if 'scenario' column exists (v2)
    if 'scenario' in df.columns:
        print("\n=== Latency Statistics by Scenario (ms) ===")
        stats = df.groupby('scenario')[['lat_fog', 'lat_cloud', 'lat_e2e']].describe(percentiles=[.5, .95])
        print(stats)
        
        # Plot Boxplot by Scenario
        plt.figure(figsize=(12, 6))
        df.boxplot(column=['lat_e2e'], by='scenario')
        plt.title('End-to-End Latency: Steady vs Burst')
        plt.suptitle('')
        plt.ylabel('Time (ms)')
        plt.savefig('latency_scenarios_boxplot.png')
        print("Saved latency_scenarios_boxplot.png")
    else:
        stats = df[['lat_fog', 'lat_cloud', 'lat_e2e']].describe(percentiles=[.5, .95])
        print("\n=== Latency Statistics (ms) ===")
        print(stats)

    # Plot Boxplot
    plt.figure(figsize=(10, 6))
    df.boxplot(column=['lat_fog', 'lat_cloud', 'lat_e2e'])
    plt.title('Latency Distribution by Stage')
    plt.ylabel('Time (ms)')
    plt.grid(True)
    plt.savefig('latency_boxplot.png')
    print("Saved latency_boxplot.png")

def analyze_cold_start():
    csv_path = 'results_coldstart_v3.csv'
    if not os.path.exists(csv_path):
        print(f"File {csv_path} not found.")
        return

    df = pd.read_csv(csv_path)
    # Filter only successful parses
    df = df[df['parse_ok'] == True]
    
    # 1. Micro-benchmark Analysis
    print("\n=== Cold Start Micro-benchmark (ms) ===")
    # Group by type and show Init vs Duration
    metrics = ['lambda_init_ms', 'lambda_duration_ms', 'client_invoke_ms']
    stats = df.groupby('type')[metrics].mean()
    print(stats)

    # Plot: Init Duration vs Execution Duration
    plt.figure(figsize=(10, 6))
    df_cold = df[df['type'] == 'COLD']
    plt.hist(df_cold['lambda_init_ms'], bins=10, alpha=0.5, label='Init Duration (Cold Start)')
    plt.hist(df['lambda_duration_ms'], bins=10, alpha=0.5, label='Execution Duration')
    plt.title('Lambda Performance: Init vs Execution')
    plt.xlabel('Time (ms)')
    plt.ylabel('Frequency')
    plt.legend()
    plt.savefig('coldstart_breakdown.png')
    print("Saved coldstart_breakdown.png")

    # 2. In-Situ Analysis (Real Pipeline)
    insitu_path = 'results_insitu_v1.csv'
    if os.path.exists(insitu_path):
        df_insitu = pd.read_csv(insitu_path)
        df_insitu = df_insitu[df_insitu['status'] == 'SUCCESS']
        
        print("\n=== In-Situ Pipeline Latency (ms) ===")
        print(df_insitu.groupby('type')['total_pipeline_ms'].describe(percentiles=[.5, .95]))
        
        plt.figure(figsize=(8, 6))
        df_insitu.boxplot(column='total_pipeline_ms', by='type')
        plt.title('Real Pipeline Latency (Cold vs Warm Burst)')
        plt.suptitle('')
        plt.ylabel('Total Time (ms)')
        plt.savefig('insitu_pipeline_boxplot.png')
        print("Saved insitu_pipeline_boxplot.png")

if __name__ == "__main__":
    analyze_latency()
    analyze_cold_start()
