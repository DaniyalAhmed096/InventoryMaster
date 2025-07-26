import sys
import json
import pandas as pd
from prophet import Prophet
from datetime import datetime, timedelta
import numpy as np

# Suppress all stdout/stderr except for the final JSON output
import logging
logging.getLogger('cmdstanpy').setLevel(logging.ERROR)
logging.getLogger('prophet').setLevel(logging.ERROR)

# Optionally, suppress plotly warning
import warnings
warnings.filterwarnings("ignore")

# Read sales history from stdin
history = json.loads(sys.stdin.read())
df = pd.DataFrame(history)
if df.empty:
    print(json.dumps([]))
    sys.exit(0)

# Ensure columns are correct
if 'ds' not in df.columns or 'y' not in df.columns:
    print(json.dumps([]))
    sys.exit(0)

df['ds'] = pd.to_datetime(df['ds'])

# --- Data Quality Check ---
if len(df) < 30:
    # Fallback: Use average of last 7 days as forecast
    avg = df['y'].tail(7).mean() if len(df) >= 7 else df['y'].mean()
    today = datetime.now().date()
    result = []
    for i in range(1, 8):
        d = (today + timedelta(days=i)).strftime('%Y-%m-%d')
        result.append({"date": d, "forecast": float(avg)})
    print(json.dumps(result))
    print(f"[Prophet] Not enough data for robust forecast (n={len(df)}). Fallback to average.", file=sys.stderr)
    sys.exit(0)

# --- Outlier Removal (IQR method) ---
q1 = df['y'].quantile(0.25)
q3 = df['y'].quantile(0.75)
iqr = q3 - q1
lower = q1 - 1.5 * iqr
upper = q3 + 1.5 * iqr
df = df[(df['y'] >= lower) & (df['y'] <= upper)]

# Ensure the last date in the history is today
if not df.empty and df['ds'].max() < pd.Timestamp(datetime.now().date()):
    today_row = {
        'ds': datetime.now().date().strftime('%Y-%m-%d'),
        'y': df['y'].iloc[-1] if not df.empty else 0
    }
    df = pd.concat([df, pd.DataFrame([today_row])], ignore_index=True)

# --- Prophet Model ---
model = Prophet(daily_seasonality=True, yearly_seasonality=True, weekly_seasonality=True)
model.fit(df)

future = model.make_future_dataframe(periods=7)
forecast = model.predict(future)

tomorrow = pd.Timestamp(datetime.now().date() + timedelta(days=1))
future_rows = forecast[forecast['ds'] >= tomorrow].head(7)

# --- Backtesting (last 7 days) ---
if len(df) > 14:
    train = df.iloc[:-7]
    test = df.iloc[-7:]
    model_bt = Prophet(daily_seasonality=True, yearly_seasonality=True, weekly_seasonality=True)
    model_bt.fit(train)
    future_bt = model_bt.make_future_dataframe(periods=7)
    forecast_bt = model_bt.predict(future_bt)
    # Align test and forecast by date
    test = test.set_index('ds')
    forecast_bt = forecast_bt.set_index('ds')
    y_true = []
    y_pred = []
    for d in test.index:
        if d in forecast_bt.index:
            y_true.append(test.loc[d, 'y'])
            y_pred.append(forecast_bt.loc[d, 'yhat'])
    if y_true and y_pred:
        mae = np.mean(np.abs(np.array(y_true) - np.array(y_pred)))
        print(f"[Prophet Backtest] Last 7 days MAE: {mae:.2f}", file=sys.stderr)

# Debug: print the forecasted dates to stderr
print(json.dumps([row.ds.strftime('%Y-%m-%d') for row in future_rows.itertuples()]), file=sys.stderr)

result = []
for row in future_rows.itertuples():
    result.append({
        "date": row.ds.strftime('%Y-%m-%d'),
        "forecast": float(row.yhat)
    })

# Print ONLY the JSON result
print(json.dumps(result))
