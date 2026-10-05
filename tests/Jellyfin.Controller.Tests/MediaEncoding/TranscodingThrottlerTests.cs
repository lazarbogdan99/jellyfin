using MediaBrowser.Controller.MediaEncoding;
using Xunit;

namespace Jellyfin.Controller.Tests.MediaEncoding;

public class TranscodingThrottlerTests
{
    [Theory]
    [InlineData(null, null, null)]
    [InlineData(100L, null, null)]
    [InlineData(null, 100L, null)]
    [InlineData(0L, 0L, 0d)]
    [InlineData(1_800_000_000L, 600_000_000L, 120d)]
    [InlineData(612_345_678L, 0L, 61.2d)]
    [InlineData(100_000_000L, 300_000_000L, -20d)]
    public void GetGapSeconds_ReturnsTimeBasedGap(long? transcodingPositionTicks, long? downloadPositionTicks, double? expected)
    {
        Assert.Equal(expected, TranscodingThrottler.GetGapSeconds(transcodingPositionTicks, downloadPositionTicks));
    }
}
