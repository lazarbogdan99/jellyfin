using System;
using System.Net;
using System.Threading.Tasks;
using Xunit;

namespace Jellyfin.Server.Integration.Tests.Controllers;

public sealed class VideoAttachmentsControllerTests : IClassFixture<JellyfinApplicationFactory>
{
    private readonly JellyfinApplicationFactory _factory;
    private static string? _accessToken;

    public VideoAttachmentsControllerTests(JellyfinApplicationFactory factory)
    {
        _factory = factory;
    }

    [Theory]
    [InlineData("0")]
    public async Task GetAttachment_Anonymous_ReturnsUnauthorized(string route)
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync($"Videos/{Guid.NewGuid()}/{Guid.NewGuid():N}/Attachments/{route}", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("0")]
    public async Task GetAttachment_NonexistentItemId_NotFound(string route)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.AddAuthHeader(_accessToken ??= await AuthHelper.CompleteStartupAsync(client));

        var response = await client.GetAsync($"Videos/{Guid.NewGuid()}/{Guid.NewGuid():N}/Attachments/{route}", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
