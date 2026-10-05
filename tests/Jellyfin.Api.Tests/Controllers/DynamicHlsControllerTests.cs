using System;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Api.Controllers;
using MediaBrowser.Controller.MediaEncoding;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Jellyfin.Api.Tests.Controllers
{
    public class DynamicHlsControllerTests
    {
        [Theory]
        [MemberData(nameof(GetSegmentLengths_Success_TestData))]
        public void GetSegmentLengths_Success(long runtimeTicks, int segmentlength, double[] expected)
        {
            var res = DynamicHlsController.GetSegmentLengthsInternal(runtimeTicks, segmentlength);
            Assert.Equal(expected.Length, res.Length);
            for (int i = 0; i < expected.Length; i++)
            {
                Assert.Equal(expected[i], res[i]);
            }
        }

        public static TheoryData<long, int, double[]> GetSegmentLengths_Success_TestData()
        {
            var data = new TheoryData<long, int, double[]>();
            data.Add(0, 6, Array.Empty<double>());
            data.Add(
                TimeSpan.FromSeconds(3).Ticks,
                6,
                new double[] { 3 });
            data.Add(
                TimeSpan.FromSeconds(6).Ticks,
                6,
                new double[] { 6 });
            data.Add(
                TimeSpan.FromSeconds(3.3333333).Ticks,
                6,
                new double[] { 3.3333333 });
            data.Add(
                TimeSpan.FromSeconds(9.3333333).Ticks,
                6,
                new double[] { 6, 3.3333333 });

            return data;
        }

        [Theory]
        [InlineData(0, 1000, 0)]
        [InlineData(-1, 1000, 0)]
        [InlineData(1000, 0, 0)]
        [InlineData(1000, -5, 0)]
        [InlineData(1_000_000, 1000, 8000)]
        [InlineData(2_500_000, 4000, 5000)]
        [InlineData(125, 1000, 1)]
        [InlineData(100, 1000, 0)]
        public void GetThroughputKbps_ReturnsKilobitsPerSecond(long bytes, int durationMs, long expected)
        {
            Assert.Equal(expected, DynamicHlsController.GetThroughputKbps(bytes, TimeSpan.FromMilliseconds(durationMs)));
        }

        [Fact]
        public async Task WaitForActiveTranscodingRequests_WaitsUntilRequestCompletes()
        {
            var job = new TranscodingJob(NullLogger<TranscodingJob>.Instance)
            {
                ActiveRequestCount = 1
            };

            var waitTask = DynamicHlsController.WaitForActiveTranscodingRequests(job, CancellationToken.None);
            Assert.False(waitTask.IsCompleted);

            job.DecrementActiveRequestCount();

            await waitTask;
        }

        [Fact]
        public async Task WaitForActiveTranscodingRequests_WaitsForEveryRequest()
        {
            var job = new TranscodingJob(NullLogger<TranscodingJob>.Instance)
            {
                ActiveRequestCount = 2
            };

            var waitTask = DynamicHlsController.WaitForActiveTranscodingRequests(job, CancellationToken.None);
            job.DecrementActiveRequestCount();

            await Task.Delay(150, TestContext.Current.CancellationToken);
            Assert.False(waitTask.IsCompleted);

            job.DecrementActiveRequestCount();

            await waitTask;
        }

        [Fact]
        public async Task WaitForActiveTranscodingRequests_ReturnsWithoutAnActiveRequest()
        {
            var job = new TranscodingJob(NullLogger<TranscodingJob>.Instance);

            await DynamicHlsController.WaitForActiveTranscodingRequests(job, CancellationToken.None);
            await DynamicHlsController.WaitForActiveTranscodingRequests(null, CancellationToken.None);
        }

        [Fact]
        public async Task WaitForActiveTranscodingRequests_ObservesCancellation()
        {
            var job = new TranscodingJob(NullLogger<TranscodingJob>.Instance)
            {
                ActiveRequestCount = 1
            };
            using var cancellationTokenSource = new CancellationTokenSource();

            var waitTask = DynamicHlsController.WaitForActiveTranscodingRequests(job, cancellationTokenSource.Token);
            await cancellationTokenSource.CancelAsync();

            await Assert.ThrowsAnyAsync<OperationCanceledException>(() => waitTask);
        }

        [Fact]
        public async Task ActiveRequestCount_UpdatesAtomically()
        {
            const int RequestCount = 1000;
            var job = new TranscodingJob(NullLogger<TranscodingJob>.Instance);

            await Task.WhenAll(
                Task.Run(() => Parallel.For(0, RequestCount, _ => job.IncrementActiveRequestCount())),
                Task.Run(() => Parallel.For(0, RequestCount, _ => job.DecrementActiveRequestCount())));

            Assert.Equal(0, job.ActiveRequestCount);
        }
    }
}
