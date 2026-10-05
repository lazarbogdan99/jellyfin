using System;
using System.Net;
using System.Net.Http;
using System.Threading.Tasks;
using Xunit;

namespace Jellyfin.Server.Integration.Tests.Controllers;

public sealed class VideosControllerTests : IClassFixture<JellyfinApplicationFactory>
{
    private readonly JellyfinApplicationFactory _factory;
    private static string? _accessToken;

    public VideosControllerTests(JellyfinApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task DeleteAlternateSources_NonexistentItemId_NotFound()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.AddAuthHeader(_accessToken ??= await AuthHelper.CompleteStartupAsync(client));

        var response = await client.DeleteAsync($"Videos/{Guid.NewGuid()}", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Theory]
    [InlineData("stream")]
    [InlineData("stream.mp4")]
    public async Task GetVideoStream_Anonymous_ReturnsUnauthorized(string route)
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync($"Videos/{Guid.NewGuid()}/{route}", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("stream")]
    [InlineData("stream.mp4")]
    public async Task HeadVideoStream_Anonymous_ReturnsUnauthorized(string route)
    {
        var client = _factory.CreateClient();

        using var request = new HttpRequestMessage(HttpMethod.Head, $"Videos/{Guid.NewGuid()}/{route}");
        var response = await client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("stream")]
    [InlineData("stream.mp4")]
    public async Task GetVideoStream_NonexistentItemId_NotFound(string route)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.AddAuthHeader(_accessToken ??= await AuthHelper.CompleteStartupAsync(client));

        var response = await client.GetAsync($"Videos/{Guid.NewGuid()}/{route}", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetVideoStream_ApiKeyQueryParameter_NotFound()
    {
        var client = _factory.CreateClient();
        _accessToken ??= await AuthHelper.CompleteStartupAsync(client);

        var response = await client.GetAsync($"Videos/{Guid.NewGuid()}/stream?ApiKey={_accessToken}", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetVideoStream_InvalidApiKeyQueryParameter_ReturnsUnauthorized()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync($"Videos/{Guid.NewGuid()}/stream?ApiKey=invalid", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
